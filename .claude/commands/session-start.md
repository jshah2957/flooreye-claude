Read these files in order — stop as soon as you have enough context:
1. .claude/state.md — last 10 lines only
2. .claude/errors.md — look for PENDING or PARTIAL entries only
3. CLAUDE.md — "Current Task" section only

Report in this exact format:
---
RESUMED
Current task: [task name]
Last completed: [task name] — [commit]
Unresolved errors: [N] — [list names if any]
Interrupted work: [yes/no — describe if yes]
---

If unresolved errors exist: ask "Fix errors first or continue with current task?"
If no errors: say "Continuing with [task]. Ready? (yes/no)"

Do NOT read SRD. Do NOT re-read all docs.
Total startup time target: under 10 seconds.
