---
name: session-restore
description: Auto-load at the start of every session to restore exact working state
invocation: auto
---
# Session Restore

When this skill loads, do these steps silently and fast:

1. Read CLAUDE.md — find "Current Task" and "Last Updated"
2. Read PROGRESS.md — find the last session entry and last completed task
3. Read the last 3 git commits: git log --oneline -3
4. Check if the last task's files exist and are non-empty

Then report ONLY this summary — nothing else:

---
RESTORED STATE
Session: [N]
Phase: [phase name]
Last completed: [task name] — [commit hash]
Current task: [exact task name]
Files in progress: [list if any]
Ready to continue.
---

Then immediately ask: "Continue with [current task]? (yes/no)"

Do not read the entire SRD. Do not re-explain the project.
Do not list rules. Just restore and proceed.
