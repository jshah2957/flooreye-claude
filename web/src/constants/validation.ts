/** ML/Validation pipeline defaults — matches backend validation_constants.py */

export const VALIDATION_DEFAULTS = {
  CONFIDENCE: 0.5,
  LAYER1_CONFIDENCE: 0.7,
  LAYER2_MIN_AREA: 0.5,
  LAYER3_K: 3,
  LAYER3_M: 5,
  LAYER4_DELTA: 0.15,
} satisfies Record<string, number>;

/** Private IP address patterns — cameras on these networks can't be reached from cloud */
export const PRIVATE_IP_PATTERNS = [
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^127\./,
  /^localhost/i,
  /^0\.0\.0\.0/,
] as const;

export function isPrivateUrl(url: string): boolean {
  try {
    const hostname = url.replace(/^[a-z]+:\/\//, "").split(/[:/]/)[0] ?? "";
    return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
