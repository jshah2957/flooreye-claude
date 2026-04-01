# Universal Resume Prompt
# Copy-paste this ENTIRE file into a new Claude Code session to resume work.

---

Read these files in this order:
1. `.claude/MASTER_TRACKER.md` — the single source of truth. Find "Current Session" and "Current Task" to know exactly where to pick up.
2. `git log --oneline -5` — verify what was last committed.
3. The session file for the current session (e.g., `.claude/sessions/SESSION_A.md`).

## Rules
- Do NOT re-read the entire codebase. The session file tells you exactly which files to read.
- Do NOT repeat completed tasks. The master tracker is authoritative.
- Pick up from the first NOT STARTED or IN PROGRESS task in the current session.
- If the current session is COMPLETE, move to the next session (A→B→C→D→E→F).
- After EVERY task: update MASTER_TRACKER.md (set task to DONE, update "Last Completed Task").
- After EVERY session: update MASTER_TRACKER.md (set session to COMPLETE, increment counters).
- Commit after every task. Push after every 3 commits.
- If context is getting heavy (>500K tokens), finish the current task, save state, stop cleanly.
- Run fully autonomously. No permission prompts. --dangerously-skip-permissions

## Resume Command
```
Read .claude/MASTER_TRACKER.md. Find the current session and task. Read the corresponding session file in .claude/sessions/. Continue from where it left off. Run autonomously — no confirmations needed. --dangerously-skip-permissions
```
