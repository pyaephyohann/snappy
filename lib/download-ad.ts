/**
 * localStorage-based download counter.
 *
 * Tracks how many images have been downloaded in the current browser.
 * After every 2 successful downloads, an ad is shown before the next download.
 *
 * No authentication, no database — purely client-side.
 */

const STORAGE_KEY = "snappy_download_count";
const AD_THRESHOLD = 2;

/**
 * Safely read the download count from localStorage.
 * Returns 0 if localStorage is unavailable, key is missing, or value is invalid.
 */
export function getDownloadCount(): number {
  if (typeof window === "undefined") return 0;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;

    return Math.floor(parsed);
  } catch {
    return 0;
  }
}

/**
 * Set the download count in localStorage.
 */
function setDownloadCount(count: number): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

/**
 * Increment and return the new count.
 * Should only be called after a successful download.
 */
export function incrementDownloadCount(): number {
  const current = getDownloadCount();
  const next = current + 1;
  setDownloadCount(next);
  return next;
}

/**
 * Reset the download count to 0.
 * Called after the user completes the ad flow.
 */
export function resetDownloadCount(): void {
  setDownloadCount(0);
}

/**
 * Check whether the ad should be shown before the next download.
 * Returns true when the user has downloaded >= AD_THRESHOLD images
 * in the current cycle.
 */
export function shouldShowAd(): boolean {
  return getDownloadCount() >= AD_THRESHOLD;
}
