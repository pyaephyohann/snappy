/**
 * Injectable HTTP transport boundary (S7-B.1).
 *
 * Payment provider adapters depend on this interface only. S7-B.1 ships NO
 * concrete network transport and performs NO network calls — tests inject a
 * fake transport. The real transport arrives with the payment initialization
 * wiring in S7-B.2.
 */

export interface PaymentHttpResponse {
  /** HTTP status code of the provider response. */
  status: number;
  /** Parsed response body (provider JSON), when present. */
  body: unknown;
}

export interface PaymentHttpRequest {
  url: string;
  /** application/x-www-form-urlencoded fields. */
  form: Record<string, string>;
}

export interface HttpTransport {
  /** Submit one form-encoded POST to a provider endpoint. */
  postForm(request: PaymentHttpRequest): Promise<PaymentHttpResponse>;
}
