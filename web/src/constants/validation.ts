/** ML/Validation pipeline defaults — matches backend validation_constants.py */

export const VALIDATION_DEFAULTS = {
  CONFIDENCE: 0.5,
  LAYER1_CONFIDENCE: 0.7,
  LAYER2_MIN_AREA: 0.5,
  LAYER3_K: 3,
  LAYER3_M: 5,
  LAYER4_DELTA: 0.15,
} satisfies Record<string, number>;
