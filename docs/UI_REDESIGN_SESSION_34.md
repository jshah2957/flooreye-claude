# FloorEye UI Redesign — Session 34 Progress
# Date: 2026-03-25

## COMPLETED

### Phase 1: Broken Elements Fixed
- [x] Removed broken dark mode toggle from Header (was disconnected from ThemeProvider)
- [x] Fixed compliance export buttons (Generate PDF + Export CSV now work with filters)
- [x] Fixed version string v2.0 → "FloorEye" in 3 auth pages (4 occurrences)

### Phase 2: Auto-Refresh Added
- [x] Detection History: 10s refetchInterval
- [x] Cameras list: 30s refetchInterval
- [x] Clips list: 15s refetchInterval

## REMAINING (for next session)

### Phase 3: Help Instructions on 17 Pages
Each page needs a collapsible "How does this work?" section. Pages:
1. Dashboard — stat cards explanation, getting started guide
2. Detection History — columns, flagging, filters
3. Incidents — severity levels, lifecycle, actions
4. Detection Control — layer explanations, recommended thresholds
5. Class Manager — what classes are, alert vs non-alert
6. Camera Detail — tab explanations, setup checklist
7. Edge Management — what agents do, commands, deploy
8. Clips — how recorded, extract frames, training use
9. Dataset — folders, split, Roboflow upload
10. Model Registry — lifecycle (draft→staging→production)
11. Roboflow Browser — what selecting does
12. Devices — supported types, triggers, auto-off
13. Notifications Config — channels, rules, quiet hours
14. Storage — what S3/MinIO is
15. Compliance — report interpretation
16. API Manager — what each integration does
17. API Tester — how to use saved tests

### Phase 4: Onboarding Flow
- [ ] Dashboard "Getting Started" card for new users (0 stores/cameras)
- [ ] Camera Detail setup checklist (ROI ✓, Dry Ref ✓, Model ✓)
- [ ] Incident visual lifecycle (NEW → ACK → RESOLVED)

### Phase 5: Incident Timeline UI
- [ ] Display timeline[] array in incident detail panel
- [ ] Show: created, detection_added, severity_upgraded, acknowledged, resolved events
- [ ] Detection frame thumbnails in incident detail

### Phase 6: Shared Component Migration
- [ ] Adopt PageHeader across all pages
- [ ] Adopt Modal for all inline modals
- [ ] Adopt DataTable for list pages
- [ ] Adopt LoadingPage/ErrorState patterns

### Phase 7: Design Consistency
- [ ] Standardize max-width (some use max-w-4xl, others full width)
- [ ] Standardize body text color (gray-900 vs gray-700)
- [ ] Use design tokens from DESIGN.md consistently
