Before closing this session:
1. Check .claude/errors.md for any PENDING or PARTIAL — warn if found
2. Update .claude/state.md with last completed task
3. Update CLAUDE.md current task
4. Update PROGRESS.md session entry
5. Run: git add .claude/ CLAUDE.md PROGRESS.md
6. Run: git commit -m "Session [N] end: [summary of what was done]"
7. Run: git push origin main
8. Print this summary:
   ---
   SESSION CLOSED
   Completed: [list tasks done]
   Errors resolved: [N]
   Errors pending: [N] — WARNING if any
   Pushed to GitHub: yes
   Next session starts at: [exact task name]
   ---
