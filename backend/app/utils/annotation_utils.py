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


def draw_annotations(
    frame_base64: str,
    predictions: list[dict],
) -> str | None:
    """Draw bounding boxes and labels on frame, return annotated base64."""
    try:
        img_data = base64.b64decode(frame_base64)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        draw = ImageDraw.Draw(img)

        for pred in predictions:
            class_name = pred.get("class_name") or pred.get("class", "unknown")
            confidence = pred.get("confidence", 0)
            color = CLASS_COLORS.get(class_name, DEFAULT_COLOR)

            # Support both bbox object and flat x/y/width/height
            bbox = pred.get("bbox", {})
            if bbox:
                x = bbox.get("x", 0) * img.width
                y = bbox.get("y", 0) * img.height
                w = bbox.get("w", 0) * img.width
                h = bbox.get("h", 0) * img.height
                x1, y1 = int(x - w / 2), int(y - h / 2)
                x2, y2 = int(x + w / 2), int(y + h / 2)
            else:
                px = pred.get("x", 0)
                py = pred.get("y", 0)
                pw = pred.get("width", 0)
                ph = pred.get("height", 0)
                x1 = int(px * img.width)
                y1 = int(py * img.height)
                x2 = int((px + pw) * img.width)
                y2 = int((py + ph) * img.height)

            # Draw box (3px border)
            for i in range(3):
                draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)

            # Draw label
            label = f"{class_name} {confidence:.0%}"
            draw.rectangle([x1, max(0, y1 - 16), x1 + len(label) * 7 + 8, y1], fill="black")
            draw.text((x1 + 4, max(0, y1 - 14)), label, fill=color)

        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85)
        return base64.b64encode(output.getvalue()).decode()
    except Exception as e:
        log.warning(f"Failed to draw annotations: {e}")
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
