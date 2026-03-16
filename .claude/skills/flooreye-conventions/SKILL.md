---
name: flooreye-conventions
description: FloorEye coding conventions - load when writing Python or TypeScript code for this project
---
# FloorEye Coding Conventions

## Python FastAPI Backend Rules
- All route handlers go in routers/ - no business logic in routers
- All business logic goes in services/
- All MongoDB field names must exactly match docs/schemas.md
- All API routes must exactly match docs/api.md
- Use Motor async driver for all database operations
- Use Pydantic models from models/ for database documents
- Use Pydantic schemas from schemas/ for API request and response
- Never use synchronous functions inside async context
- Every endpoint must have: auth dependency, org_id filter, proper error handling
- org_id must be applied to every database query - no cross-org data leakage

## TypeScript React Web Rules
- All API calls must go through web/src/lib/api.ts axios instance
- All server state managed via TanStack Query useQuery and useMutation
- All auth state managed via useAuth hook only
- All routes defined in web/src/routes/index.tsx
- Use Shadcn UI components and Tailwind CSS only
- No inline styles allowed

## TypeScript React Native Mobile Rules
- All API calls through mobile/services/api.ts only
- Tokens stored in Expo SecureStore only - never AsyncStorage or localStorage
- All global state via Zustand stores in mobile/stores/
- Navigation via Expo Router file-based routing only

## Absolute Rules - No Exceptions
- No mock data anywhere in the codebase
- No hardcoded IDs, emails, ObjectIds, or credentials
- No new npm or pip libraries without explicit approval
- No modifying files already marked complete in CLAUDE.md
- No adding features not in the SRD
- Always read docs/schemas.md before writing any model
- Always read docs/api.md before writing any route
- Commit after every completed task
- Push to GitHub every 3 commits

## Context Privacy (context-mode)
When working with sensitive FloorEye data use context-mode:
- Never log camera RTSP URLs with credentials in context
- Never display API keys in output (Roboflow, Firebase, SMTP)
- Use context-mode ctx_execute for credential handling
- All .env values treated as private context
- Route docker logs through ctx_execute to avoid context bloat
- Process large detection_logs query results through ctx_execute_file

## Available External Frameworks
- **obra/superpowers**: Agentic methodology — use for complex multi-step tasks, parallel agents, TDD, code review
- **gsd-build/get-shit-done**: Spec-driven development — use for feature planning, milestone tracking, autonomous execution
- **anthropics/skills**: Official Anthropic skills — use for standard workflows, document generation, API integration
- **mksglu/context-mode**: Privacy-first context optimization — use for credential protection, log analysis, large output handling
- **VibeCodingWithPhil/agentwise**: Multi-agent orchestration — use for parallel agent coordination, token optimization, automatic verification

## Agentwise Integration
Use agentwise orchestration for:
- Multi-agent review sessions (11 specialist agents available)
- Complex feature implementation (TaskDistributor routes to best agent)
- Automated verification after fixes (TaskCompletionValidator, CodeValidator)
- Token-efficient long sessions (15-30% savings via context sharing)
- See .claude/skills/agentwise/flooreye-config.md for FloorEye-specific agent mapping
