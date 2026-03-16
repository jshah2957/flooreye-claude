---
name: progress-tracking
description: Keep CLAUDE.md and PROGRESS.md updated - load after completing any task
---
# Progress Tracking Rules

After EVERY completed task without exception:
1. Update CLAUDE.md
   - Change current task to completed
   - Set next task as current
   - Update Last Updated timestamp
2. Update PROGRESS.md
   - Add task entry under current session
   - Include: task name, files created or modified, commit hash
3. These updates happen BEFORE moving to the next task

At end of every session:
- Run /session-end command
- Never close Claude Code without saving progress
