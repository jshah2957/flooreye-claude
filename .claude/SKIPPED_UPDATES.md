# Skipped Updates Report
# Date: 2026-03-17
# Found by scanning all session history and code

## SUMMARY
Total planned updates: 20
Actually implemented: 12
Skipped or partial: 8

## SKIPPED ITEMS

### SKIP-1: change_streams.py is empty stub
- File: backend/app/db/change_streams.py
- Content: `# TODO: implement`
- Impact: WebSocket broadcasts not triggered by DB changes
- Priority: MEDIUM (already wired manually in incident_service)

### SKIP-2: audit_log model is empty stub
- File: backend/app/models/audit_log.py
- Content: `# TODO: implement`
- Impact: No audit log model defined
- Priority: LOW (audit_logs collection works schemaless)

### SKIP-3: clip model is empty stub
- File: backend/app/models/clip.py
- Content: `# TODO: implement`
- Impact: No Pydantic model for clips
- Priority: LOW (clips collection works schemaless)

### SKIP-4: mobile schema is empty stub
- File: backend/app/schemas/mobile.py
- Content: `# TODO: implement`
- Impact: Mobile endpoints return raw dicts
- Priority: LOW (works but no response validation)

### SKIP-5: Live Monitoring page is placeholder
- File: web/src/routes/index.tsx line for /monitoring
- Current: `<Placeholder title="Live Monitoring" />`
- Impact: Core feature completely missing
- Priority: HIGH

### SKIP-6: CamerasConfigPage is empty placeholder
- File: web/src/pages/config/CamerasConfigPage.tsx
- Content: `export default function Placeholder() { return null }`
- Priority: LOW (CamerasPage exists and works)

### SKIP-7: StoresConfigPage is empty placeholder
- File: web/src/pages/config/StoresConfigPage.tsx
- Content: `export default function Placeholder() { return null }`
- Priority: LOW (StoresPage exists and works)

### SKIP-8: forgot-password/reset-password are 501
- File: backend/app/routers/auth.py
- Status: 501 Not Implemented (requires SMTP)
- Priority: MEDIUM (documented as blocked on SMTP)
