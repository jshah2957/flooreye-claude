Read .claude/errors.md for all PENDING and PARTIAL test failures.
Fix them one at a time in order.
For each fix:
1. Show what the error was
2. Show what file was changed
3. Re-run that specific test only
4. Mark RESOLVED or RECURRING in errors.md
5. Update test-results.md
After fixing run: git commit -m "Fix: [test name] resolved"
