"""
PDF Report Generation — HTML-based report for detection/incident summaries.

Generates an HTML report as bytes (suitable for download as .html or conversion to PDF).
No external PDF library required.
"""

import logging
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query

log = logging.getLogger(__name__)


async def generate_report(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str | None = None,
    days: int = 30,
) -> bytes:
    """
    Generate a detection/incident summary report.

    Args:
        db: Motor database instance.
        org_id: Organization ID.
        store_id: Optional store filter.
        days: Number of days to include (default 30).

    Returns:
        Report content as bytes (HTML format).
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    # Build query filters
    base_query: dict = org_query(org_id)
    if store_id:
        base_query["store_id"] = store_id

    detection_query = {**base_query, "timestamp": {"$gte": since}}
    incident_query = {**base_query, "created_at": {"$gte": since}}

    # Gather stats
    total_detections = await db.detection_logs.count_documents(detection_query)
    wet_detections = await db.detection_logs.count_documents({**detection_query, "is_wet": True})
    dry_detections = total_detections - wet_detections

    total_incidents = await db.incidents.count_documents(incident_query)
    open_incidents = await db.incidents.count_documents({**incident_query, "status": "open"})
    resolved_incidents = await db.incidents.count_documents({**incident_query, "status": "resolved"})

    # Severity breakdown
    severity_counts = {}
    for sev in ["low", "medium", "high", "critical"]:
        count = await db.incidents.count_documents({**incident_query, "severity": sev})
        if count > 0:
            severity_counts[sev] = count

    # Recent incidents (top 20)
    cursor = db.incidents.find(incident_query).sort("created_at", -1).limit(20)
    recent_incidents = await cursor.to_list(length=20)

    # Store name lookup
    store_name = "All Stores"
    if store_id:
        store = await db.stores.find_one({**org_query(org_id), "id": store_id})
        if store:
            store_name = store.get("name", store_id)

    # Build HTML report
    html = _build_html_report(
        store_name=store_name,
        days=days,
        report_date=now.strftime("%Y-%m-%d %H:%M UTC"),
        total_detections=total_detections,
        wet_detections=wet_detections,
        dry_detections=dry_detections,
        total_incidents=total_incidents,
        open_incidents=open_incidents,
        resolved_incidents=resolved_incidents,
        severity_counts=severity_counts,
        recent_incidents=recent_incidents,
    )

    return html.encode("utf-8")


def _build_html_report(
    store_name: str,
    days: int,
    report_date: str,
    total_detections: int,
    wet_detections: int,
    dry_detections: int,
    total_incidents: int,
    open_incidents: int,
    resolved_incidents: int,
    severity_counts: dict,
    recent_incidents: list[dict],
) -> str:
    """Build the HTML report string."""

    severity_rows = ""
    for sev, count in severity_counts.items():
        severity_rows += f"<tr><td>{sev.capitalize()}</td><td>{count}</td></tr>\n"
    if not severity_rows:
        severity_rows = "<tr><td colspan='2'>No incidents in period</td></tr>"

    incident_rows = ""
    for inc in recent_incidents:
        created = inc.get("created_at", "")
        if hasattr(created, "strftime"):
            created = created.strftime("%Y-%m-%d %H:%M")
        incident_rows += (
            f"<tr>"
            f"<td>{inc.get('id', '')[:8]}...</td>"
            f"<td>{inc.get('severity', 'N/A')}</td>"
            f"<td>{inc.get('status', 'N/A')}</td>"
            f"<td>{inc.get('detection_count', 0)}</td>"
            f"<td>{created}</td>"
            f"</tr>\n"
        )
    if not incident_rows:
        incident_rows = "<tr><td colspan='5'>No incidents in period</td></tr>"

    wet_rate = f"{(wet_detections / total_detections * 100):.1f}%" if total_detections > 0 else "N/A"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>FloorEye Report — {store_name}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; color: #333; }}
        h1 {{ color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 10px; }}
        h2 {{ color: #374151; margin-top: 30px; }}
        table {{ border-collapse: collapse; width: 100%; margin-top: 10px; }}
        th, td {{ border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }}
        th {{ background-color: #f3f4f6; font-weight: 600; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 15px; }}
        .summary-card {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; }}
        .summary-card .number {{ font-size: 2em; font-weight: 700; color: #1a56db; }}
        .summary-card .label {{ font-size: 0.9em; color: #6b7280; }}
        .meta {{ color: #6b7280; font-size: 0.9em; }}
        .footer {{ margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 10px; color: #9ca3af; font-size: 0.85em; }}
    </style>
</head>
<body>
    <h1>FloorEye Detection Report</h1>
    <p class="meta">Store: <strong>{store_name}</strong> | Period: Last {days} days | Generated: {report_date}</p>

    <h2>Summary</h2>
    <div class="summary-grid">
        <div class="summary-card">
            <div class="number">{total_detections}</div>
            <div class="label">Total Detections</div>
        </div>
        <div class="summary-card">
            <div class="number">{wet_detections}</div>
            <div class="label">Wet Detections ({wet_rate})</div>
        </div>
        <div class="summary-card">
            <div class="number">{total_incidents}</div>
            <div class="label">Total Incidents</div>
        </div>
    </div>

    <h2>Detection Breakdown</h2>
    <table>
        <tr><th>Metric</th><th>Count</th></tr>
        <tr><td>Total Detections</td><td>{total_detections}</td></tr>
        <tr><td>Wet Detections</td><td>{wet_detections}</td></tr>
        <tr><td>Dry Detections</td><td>{dry_detections}</td></tr>
        <tr><td>Wet Detection Rate</td><td>{wet_rate}</td></tr>
    </table>

    <h2>Incident Summary</h2>
    <table>
        <tr><th>Metric</th><th>Count</th></tr>
        <tr><td>Total Incidents</td><td>{total_incidents}</td></tr>
        <tr><td>Open</td><td>{open_incidents}</td></tr>
        <tr><td>Resolved</td><td>{resolved_incidents}</td></tr>
    </table>

    <h2>Severity Breakdown</h2>
    <table>
        <tr><th>Severity</th><th>Count</th></tr>
        {severity_rows}
    </table>

    <h2>Recent Incidents</h2>
    <table>
        <tr><th>ID</th><th>Severity</th><th>Status</th><th>Detections</th><th>Created</th></tr>
        {incident_rows}
    </table>

    <div class="footer">
        <p>Generated by FloorEye v2.0 — See Every Drop. Stop Every Slip.</p>
    </div>
</body>
</html>"""
