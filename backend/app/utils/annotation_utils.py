"""Draw bounding box annotations on detection frames."""

import base64
import io
import logging

from PIL import Image, ImageDraw

log = logging.getLogger(__name__)

CLASS_COLORS = {
    "wet_floor": "#DC2626",
    "puddle": "#DC2626",
    "spill": "#D97706",
    "dry_floor": "#16A34A",
    "reflection": "#2563EB",
    "human": "#7C3AED",
}

DEFAULT_COLOR = "#00FFFF"


def _resolve_bbox(pred: dict, img_w: int, img_h: int) -> tuple[int, int, int, int] | None:
    """Auto-detect bbox format and return clamped (x1, y1, x2, y2) pixel coords.

    Supported formats:
      1. {x1, y1, x2, y2}           — absolute pixel corners
      2. bbox {x, y, w, h} > 1.0    — pixel center-format
      3. bbox {x, y, w, h} <= 1.0   — normalized center-format
      4. flat {x, y, width, height} > 1.0  — pixel top-left
      5. flat {x, y, width, height} <= 1.0 — normalized top-left
    """
    bbox = pred.get("bbox") or {}
    x1 = y1 = x2 = y2 = None

    # Format 1: explicit corner coords (x1, y1, x2, y2)
    if all(k in bbox for k in ("x1", "y1", "x2", "y2")):
        x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
    elif all(k in pred for k in ("x1", "y1", "x2", "y2")):
        x1, y1, x2, y2 = pred["x1"], pred["y1"], pred["x2"], pred["y2"]

    # Format 2/3: bbox dict with center-format {x, y, w, h}
    elif bbox and all(k in bbox for k in ("x", "y", "w", "h")):
        cx, cy, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
        if any(v > 1.0 for v in (cx, cy, w, h)):
            # Pixel center-format
            x1, y1 = cx - w / 2, cy - h / 2
            x2, y2 = cx + w / 2, cy + h / 2
        else:
            # Normalized center-format
            x1 = (cx - w / 2) * img_w
            y1 = (cy - h / 2) * img_h
            x2 = (cx + w / 2) * img_w
            y2 = (cy + h / 2) * img_h

    # Format 4/5: flat prediction with {x, y, width, height} (Roboflow style, top-left)
    elif all(k in pred for k in ("x", "y", "width", "height")):
        px, py = pred["x"], pred["y"]
        pw, ph = pred["width"], pred["height"]
        if any(v > 1.0 for v in (px, py, pw, ph)):
            # Pixel top-left
            x1, y1 = px, py
            x2, y2 = px + pw, py + ph
        else:
            # Normalized top-left
            x1, y1 = px * img_w, py * img_h
            x2, y2 = (px + pw) * img_w, (py + ph) * img_h

    # Format 4/5 fallback: flat {x, y, w, h} (edge ONNX sometimes uses short keys)
    elif all(k in pred for k in ("x", "y", "w", "h")) and not bbox:
        cx, cy, w, h = pred["x"], pred["y"], pred["w"], pred["h"]
        if any(v > 1.0 for v in (cx, cy, w, h)):
            x1, y1 = cx - w / 2, cy - h / 2
            x2, y2 = cx + w / 2, cy + h / 2
        else:
            x1 = (cx - w / 2) * img_w
            y1 = (cy - h / 2) * img_h
            x2 = (cx + w / 2) * img_w
            y2 = (cy + h / 2) * img_h

    else:
        return None

    # Clamp to image bounds
    x1 = max(0, min(int(x1), img_w - 1))
    y1 = max(0, min(int(y1), img_h - 1))
    x2 = max(0, min(int(x2), img_w - 1))
    y2 = max(0, min(int(y2), img_h - 1))

    # Reject degenerate boxes
    if x2 <= x1 or y2 <= y1:
        return None

    return x1, y1, x2, y2


def draw_annotations(
    frame_base64: str,
    predictions: list[dict],
) -> str | None:
    """Draw bounding boxes and labels on frame, return annotated base64.

    Auto-detects bbox format from multiple sources (Roboflow, edge ONNX,
    normalized center-format) and converts to pixel coordinates.
    One bad prediction will not crash the entire draw — it is skipped.
    """
    try:
        img_data = base64.b64decode(frame_base64)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        draw = ImageDraw.Draw(img)

        for pred in predictions:
            try:
                coords = _resolve_bbox(pred, img.width, img.height)
                if coords is None:
                    log.debug("Skipping prediction with unrecognised bbox format: %s", pred)
                    continue

                x1, y1, x2, y2 = coords

                class_name = (
                    pred.get("class_name")
                    or pred.get("class")
                    or pred.get("bbox", {}).get("class_name")
                    or "unknown"
                )
                confidence = pred.get("confidence", 0)
                color = CLASS_COLORS.get(class_name, DEFAULT_COLOR)

                # Draw box (3px border)
                for i in range(3):
                    draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)

                # Draw label
                label = f"{class_name} {confidence:.0%}"
                label_w = len(label) * 7 + 8
                label_y = max(0, y1 - 16)
                draw.rectangle([x1, label_y, x1 + label_w, y1], fill="black")
                draw.text((x1 + 4, max(0, y1 - 14)), label, fill=color)

            except Exception as e:
                log.debug("Skipping bad prediction: %s — %s", pred, e)
                continue

        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85)
        return base64.b64encode(output.getvalue()).decode()
    except Exception as e:
        log.warning("Failed to draw annotations: %s", e)
        return None


def create_thumbnail(frame_base64: str, width: int = 280, height: int = 175) -> str | None:
    """Resize frame to thumbnail size."""
    try:
        img_data = base64.b64decode(frame_base64)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        img = img.resize((width, height), Image.LANCZOS)
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=80)
        return base64.b64encode(output.getvalue()).decode()
    except Exception as e:
        log.warning(f"Failed to create thumbnail: {e}")
        return None
