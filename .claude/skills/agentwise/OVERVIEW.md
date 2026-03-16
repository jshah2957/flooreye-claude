# Agentwise Framework Overview
# Source: https://github.com/VibeCodingWithPhil/agentwise

## What it does
Agentwise is a multi-agent orchestration system for Claude Code that coordinates
multiple AI agents for parallel task execution, intelligent task distribution,
and automatic verification. It provides 11 specialist agents, 50+ slash commands,
token optimization (15-30% reduction), and a real-time monitoring dashboard.

## Token optimization (15-30%)
- **Context sharing**: Agents share context efficiently instead of each loading everything
- **TokenOptimizer**: Analyzes context usage and prunes unnecessary tokens
- **MemoryManager**: Manages agent memory with LRU eviction and compression
- **Modular context injection**: Only refreshes changed portions of context
- **CodebaseContextManager**: Real-time codebase graph avoids re-reading unchanged files

## Multi-agent orchestration
- **11 specialist agents**: Backend, frontend, database, DevOps, testing, code review,
  design review, designer, research, deployment, Rust IDE
- **TaskDistributor**: Routes tasks to the most appropriate agent based on type
- **AgentManager**: Manages agent lifecycle, spawning, and coordination
- **PhaseController**: Orchestrates multi-phase implementations
- **DynamicAgentManager**: Creates agents on-the-fly for novel task types

## Self-improving agents
- **ClaimTracker**: Tracks agent claims and verifies them against outcomes
- **Trust scores**: Agents earn trust based on successful completions
- **Performance baseline**: Tracks metrics for continuous improvement
- **HallucinationDetector**: Catches false claims from agents

## Automatic verification
- **TaskCompletionValidator**: Validates tasks are actually complete
- **CodeValidator**: Checks code quality and correctness
- **SyntaxValidator**: Ensures syntax correctness across languages
- **StyleValidator**: Enforces coding style consistency
- **PerformanceValidator**: Verifies performance claims
- **ClaimDebunker**: Cross-references agent claims with evidence

## Commands provided (50+)
### Project Management
/create, /create-project, /create-plan, /projects, /project-status, /init-import

### Task Management
/task, /task-plan, /task-dynamic, /task-import

### Agent Management
/generate-agent, /configure-agentwise, /configure-routing, /update-agentwise

### Database
/database-setup, /database-connect, /database-wizard

### Monitoring
/monitor, /protection-status, /security-report, /security-review

### Deployment
/deploy, /rollback, /enable-protection

### Requirements
/requirements, /requirements-enhance, /requirements-to-tasks, /requirements-visualize

### Figma Integration
/figma, /figma-auth, /figma-create, /figma-generate, /figma-inspect, /figma-list, /figma-select, /figma-sync

### GitHub Integration
/github-setup, /github-secrets, /github-sync

### Other
/clone-website, /docs, /image, /upload, /visual-test, /local-models, /setup-lmstudio, /setup-ollama, /setup-mcps

## How to use in FloorEye

### For backend development
Use the backend-specialist agent for FastAPI endpoint implementation.
Use the database-specialist for MongoDB query optimization.
Route backend tasks through /task with type detection.

### For frontend development
Use the frontend-specialist for React component work.
Use the designer-specialist for UI layout decisions.
Use /figma-sync if Figma designs exist.

### For testing
Use the testing-specialist agent for pytest and verification.
TaskCompletionValidator auto-verifies after each task.
CodeValidator catches quality issues before commit.

### For the multi-agent review system
Agentwise's 11 specialists map to FloorEye's 3-agent pattern:
- architect-agent -> design-review-specialist + research-specialist
- developer-agent -> backend-specialist + frontend-specialist + database-specialist
- test-agent -> testing-specialist + code-review-specialist

### Token savings estimate
Typical FloorEye session: ~200K tokens
With agentwise context sharing: ~150K tokens
Estimated savings per session: 25%
