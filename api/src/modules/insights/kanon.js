import { K_ANONYMITY } from '../../catalogues.js';

/**
 * Server-side k-anonymity. A count of people below k is replaced by null and flagged, so the
 * UI can only ever show "< 10". Applied inside every insight before anything leaves the API.
 */
export function mask(count, k = K_ANONYMITY) {
  return count >= k ? { value: count, masked: false } : { value: null, masked: true };
}

/** Ratio of two people counts, or null when either side is below k. */
export function safeRate(numerator, denominator, k = K_ANONYMITY) {
  if (denominator < k) return null;
  return Number((numerator / denominator).toFixed(3));
}
