/**
 * Concrete HTTPS fetch transport for payment providers (S7-B.2).
 *
 * S7-B.1 shipped the injectable `HttpTransport` boundary with no network
 * implementation; this is the smallest production transport behind that
 * interface, using the platform-native `fetch` (no third-party HTTP library).
 *
 * Properties:
 * - SERVER-ONLY: never import from client code. Credentials only ever travel
 *   inside the form body handed over by the provider adapter.
 * - HTTPS only: non-https provider URLs are rejected before any request.
 * - Bounded timeout: one shot per request via `AbortSignal.timeout` — a timed
 *   out request is NOT retried here (a retry loop could duplicate a payment
 *   request; retry/idempotency policy lives in the caller).
 * - Bounded response size: at most `maxResponseBytes` are read; an oversized
 *   body is dropped (parsed as absent) so the provider adapter fails closed
 *   with `unexpected_response` instead of trusting a truncated payload.
 * - No logging at all: request forms (which contain signatures) and response
 *   bodies are never logged; errors carry static messages only.
 * - Safe error mapping: every failure becomes a `PaymentProviderError`
 *   (`transport_error` for timeout/network), never a raw fetch error that
 *   could leak internals upward.
 */
import { PaymentProviderError } from "./payment-contract";
import type { HttpTransport, PaymentHttpRequest, PaymentHttpResponse } from "./http-transport";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

export interface FetchHttpTransportOptions {
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum response body bytes accepted before the body is discarded. */
  maxResponseBytes?: number;
}

export class FetchHttpTransport implements HttpTransport {
  constructor(private readonly options: FetchHttpTransportOptions = {}) {}

  async postForm(request: PaymentHttpRequest): Promise<PaymentHttpResponse> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      throw new PaymentProviderError("invalid_input", "provider request URL is invalid");
    }
    if (url.protocol !== "https:") {
      throw new PaymentProviderError("invalid_input", "provider endpoint must use https");
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResponseBytes = this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(request.form).toString(),
        signal: AbortSignal.timeout(timeoutMs),
        // A redirect from a payment API is not a success — fail instead.
        redirect: "error",
        cache: "no-store",
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new PaymentProviderError("transport_error", "payment provider request timed out");
      }
      throw new PaymentProviderError("transport_error", "payment provider request failed");
    }

    const text = await readBoundedBody(response, maxResponseBytes);
    let body: unknown = null;
    if (text !== null) {
      try {
        body = JSON.parse(text);
      } catch {
        // Malformed provider response: parsed as absent; the adapter decides.
        body = null;
      }
    }
    return { status: response.status, body };
  }
}

/**
 * Read at most `maxResponseBytes` of the response body. Returns null when the
 * body is missing, unreadable, or over the bound (fail closed, never parse a
 * truncated payload).
 */
async function readBoundedBody(response: Response, maxResponseBytes: number): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) return null;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
