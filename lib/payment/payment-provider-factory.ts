/**
 * Server-only payment provider wiring (S7-B.2).
 *
 * Chooses and caches the concrete `PaymentProvider` from server-only
 * configuration. Application services depend on the provider-neutral
 * `PaymentProvider` interface only — Wave payload construction, signing, and
 * endpoint selection stay inside the adapter.
 *
 * SERVER-ONLY: resolves credentials via `resolveWaveProviderConfig()` and
 * must never be imported from client code.
 */
import type { PaymentProvider } from "./payment-contract";
import { resolveWaveProviderConfig } from "./payment-config";
import { createWavePaymentProvider } from "./wave-payment-provider";
import { FetchHttpTransport } from "./fetch-http-transport";

let instance: PaymentProvider | null = null;

/** The process-wide payment provider (currently Wave), created lazily. */
export function getPaymentProvider(): PaymentProvider {
  if (!instance) {
    instance = createWavePaymentProvider({
      config: resolveWaveProviderConfig(),
      transport: new FetchHttpTransport(),
    });
  }
  return instance;
}

/** Test seam: replace or reset the cached provider instance. */
export function setPaymentProviderForTests(provider: PaymentProvider | null): void {
  instance = provider;
}
