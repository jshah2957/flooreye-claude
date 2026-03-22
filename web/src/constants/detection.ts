/** Detection class names and annotation colors */

export const WET_CLASS_NAMES = [
  "wet_floor",
  "spill",
  "puddle",
  "water",
  "wet",
] as const;

/** Colors for drawing detection bounding boxes on canvas */
export const CLASS_COLORS: Record<string, string> = {
  wet_floor: "#DC2626",
  puddle: "#DC2626",
  spill: "#D97706",
  water: "#3B82F6",
  dry_floor: "#16A34A",
};
