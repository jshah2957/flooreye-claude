---
name: no-mocks
description: Prevent mock data - load when writing any API endpoint, service, or data fetching code
---
# No Mock Data - Absolute Rule

NEVER do any of the following under any circumstances:
- Return hardcoded arrays or objects from API endpoints
- Use faker, json-server, miragejs, msw, or any mock library
- Hardcode any user ID, store ID, camera ID, or ObjectId
- Create fake detection results or fake incident data
- Return static data as placeholder or for testing

When real data is not yet available:
- Return empty list with correct response structure
- Return HTTP 501 Not Implemented with clear message
- Never invent or fabricate data

This rule has zero exceptions including during development and testing.
