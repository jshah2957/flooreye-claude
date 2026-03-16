# FloorEye Function Test Results
# Date: 2026-03-16 (Session 24)

## Performance
| Metric | Result | Target |
|--------|--------|--------|
| Login | 126ms | <500ms |
| API health | 99ms | <300ms |
| Tunnel (warm) | 99ms | <200ms |

## Batch Results
| Batch | Tests | Result |
|-------|-------|--------|
| 1 - Infrastructure | 4/4 | ALL PASS |
| 2 - Store/Camera | 3/3 | ALL PASS |
| 3 - Detection | 2/2 | ALL PASS |
| 4 - Dataset | 2/2 | ALL PASS |
| 5 - ML | 2/2 | ALL PASS |
| 6 - Edge/IoT | 2/2 | ALL PASS |
| 7 - Incidents/Notifications | 3/3 | ALL PASS |
| 8 - Control/Review | 5/5 | ALL PASS |
| **TOTAL** | **25/25** | **ALL PASS** |

## Test Data Verified
- 7 users (admin + 5 roles + orgadmin)
- 7 stores (3 test + 4 from previous sessions)
- 11 cameras (7 test + 4 from previous sessions)
- 3 IoT devices
- 3 notification rules
- 1 edge agent (online)
- 1 detection in history
