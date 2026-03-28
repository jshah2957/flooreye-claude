/**
 * Detection class utilities — NO hardcoded class names.
 * Colors generated deterministically from class name hash.
 * Alert class list fetched from API at runtime.
 */

/**
 * Generate a deterministic hex color from a class name.
 * Uses a simple hash to produce a consistent 6-char hex color.
 * Consistent across sessions — same class name always gets the same color.
 */
export function getClassColor(className: string): string {
  if (!className) return "#9CA3AF";
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    const char = className.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(6, "0").slice(0, 6);
  return `#${hex}`;
}

/**
 * Check if a class name is a "wet/alert" class.
 * This should be fetched from the API (GET /detection-control/classes?alert_on_detect=true)
 * and cached. This function is a FALLBACK ONLY — returns false if no data loaded.
 */
let _cachedAlertClasses: Set<string> | null = null;

export function setAlertClasses(classes: string[]): void {
  _cachedAlertClasses = new Set(classes.map(c => c.toLowerCase()));
}

export function isAlertClass(className: string): boolean {
  if (!_cachedAlertClasses) return false;
  return _cachedAlertClasses.has(className.toLowerCase());
}
