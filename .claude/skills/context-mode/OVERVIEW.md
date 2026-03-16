# Context-Mode Framework Overview
# Source: https://github.com/mksglu/context-mode

## What it does
Context Mode is an MCP server that solves context window bloat. Every MCP tool call
dumps raw data into your context window — a Playwright snapshot costs 56KB, 20 GitHub
issues cost 59KB. After 30 minutes, 40% of context is consumed. Context Mode sandboxes
raw data processing so it never enters the context window, achieving 98% context savings.

## Privacy features
- Nothing leaves your machine — no telemetry, no cloud sync, no usage tracking
- No account required — fully local operation
- SQLite databases live in your home directory
- All code, prompts, and session data stay local
- Privacy-first architecture by design, not afterthought

## How it virtualizes context
1. **Sandbox Execution**: Raw data stays in a subprocess, never enters context window
2. **MCP Protocol Layer**: Operates at the protocol level, intercepting tool calls
3. **FTS5 Indexing**: Indexes data into SQLite full-text search
4. **BM25 Search**: Retrieves only relevant chunks via ranked search
5. **Session Continuity**: Tracks file edits, git ops, tasks, errors in SQLite
6. **PreToolUse Hooks**: Intercepts Bash, Read, WebFetch, Grep calls automatically

## MCP integration
- Installs as Claude Code plugin or standalone MCP server
- 6 sandbox tools: ctx_batch_execute, ctx_execute, ctx_execute_file, ctx_index, ctx_search, ctx_fetch_and_index
- PreToolUse hooks intercept and redirect data-heavy commands
- PostToolUse, PreCompact, SessionStart hooks for session tracking
- Works with Claude Code, Gemini CLI, VS Code Copilot, Cursor, Kiro

## Commands/Skills provided
| Command | Description |
|---------|-------------|
| /context-mode | Main context optimization skill |
| /ctx-stats | Context savings per-tool breakdown |
| /ctx-doctor | Diagnostics — runtimes, hooks, FTS5 |
| /ctx-upgrade | Pull latest, rebuild, migrate cache |
| /ctx-cloud-setup | Cloud deployment setup |
| /ctx-cloud-status | Cloud service status check |

## How to use in FloorEye
- **Protecting camera credentials**: Use ctx_execute instead of Bash for RTSP URL operations
- **Sanitizing detection data**: Process large detection logs through ctx_execute_file
- **Managing org isolation**: Sandbox database queries to prevent context leakage
- **Secure API key handling**: Never dump .env or API responses directly into context
- **Log analysis**: Route docker logs and backend logs through ctx_execute
- **Test output**: Run pytest through ctx_execute to keep test output sandboxed
