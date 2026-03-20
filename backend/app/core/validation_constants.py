"""Shared validation constants for the 4-layer detection pipeline.

Used by:
- backend/app/services/validation_pipeline.py
- backend/app/services/detection_control_service.py
- backend/app/services/detection_service.py
- backend/app/workers/detection_worker.py
"""

# Layer 1: Confidence filter
DEFAULT_LAYER1_CONFIDENCE = 0.70

# Layer 2: Minimum wet area (percent of frame)
DEFAULT_LAYER2_MIN_AREA = 0.5

# Layer 3: Temporal voting (K wet frames out of M recent)
DEFAULT_LAYER3_K = 3
DEFAULT_LAYER3_M = 5

# Layer 4: Dry floor reference delta threshold
DEFAULT_LAYER4_DELTA = 0.15

# Wet detection class names
WET_CLASS_NAMES = {"wet", "spill", "puddle", "water", "wet_floor"}
