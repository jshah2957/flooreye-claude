# Agentwise Configuration for FloorEye
# Optimized for this specific project

## Agent definitions
architect-agent:
  maps-to: design-review-specialist + research-specialist
  role: Reviews system design and API contracts
  context: docs/SRD.md, docs/api.md, docs/schemas.md
  token-budget: 20000

developer-agent:
  maps-to: backend-specialist + frontend-specialist + database-specialist
  role: Implements backend and frontend fixes
  context: backend/app/, web/src/, docs/api.md, docs/schemas.md
  token-budget: 30000

ui-agent:
  maps-to: designer-specialist + frontend-specialist
  role: Implements frontend UI components
  context: web/src/, docs/ui.md
  token-budget: 25000

test-agent:
  maps-to: testing-specialist + code-review-specialist
  role: Runs and verifies tests
  context: backend/tests/, .claude/test-results.md
  token-budget: 10000

devops-agent:
  maps-to: deployment-specialist + devops-specialist
  role: Docker, CI/CD, tunnel management
  context: docker-compose.prod.yml, .github/workflows/
  token-budget: 15000

## Verification rules
After every backend change: run pytest on changed module
After every frontend change: run npm run build
After every API change: run /verify-routes
After every schema change: run /verify-schemas
After every edge agent change: check docker logs for 422s

## Token optimization settings
Use context compression: yes
Skip re-reading unchanged files: yes
Cache common context: docs/, .claude/skills/
Max context per agent: 50000 tokens
Compress history after: 10 turns

## FloorEye-specific routing
Backend Python files -> backend-specialist
React TypeScript files -> frontend-specialist
MongoDB queries -> database-specialist
Docker/deploy tasks -> devops-specialist
Test files -> testing-specialist
Edge agent code -> backend-specialist + devops-specialist
Mobile code -> frontend-specialist
ML pipeline -> research-specialist + backend-specialist
