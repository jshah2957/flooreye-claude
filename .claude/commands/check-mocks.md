Scan all Python and TypeScript files modified in the last git commit for:
- Hardcoded arrays of fake data
- Mock API responses
- Hardcoded IDs, emails, or ObjectIds
- Any import of: faker, json-server, miragejs, msw, unittest.mock in production code
Report every violation with exact file name and line number.
Print PASS if none found.
