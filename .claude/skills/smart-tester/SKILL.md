---
name: smart-tester
description: Auto-load when running any tests - breaks into chunks, saves results, resumes from last checkpoint
invocation: auto
---
# Smart Test Runner

## Core Rules
- Never run all tests at once
- Run maximum 3 tests per chunk
- Save result after every single test
- If a test fails stop that chunk and fix before continuing
- Never move to next chunk with failing tests

## Test State File
After every test write to .claude/test-results.md:
[datetime] | [test name] | PASS/FAIL | [response code or error] | [fix applied if any]

## On session start
Read .claude/test-results.md
Find last test that ran
Resume from next test
Never re-run tests already marked PASS

## Chunk size
Maximum 3 tests per Claude Code session chunk
After 3 tests:
1. Save results to .claude/test-results.md
2. Run /checkpoint "tests chunk N complete"
3. Report: passed/failed in this chunk
4. Ask: "Continue to next chunk? (yes/no)"

## Fix discipline
If test fails:
1. Log to .claude/errors.md immediately
2. Identify root cause
3. Apply fix
4. Re-run ONLY that failed test
5. If passes mark PASS and continue
6. If fails again mark RECURRING and stop
7. Never skip a failing test

## Credit efficiency
- Use curl for API tests - not Python scripts
- Reuse auth token across all tests in same session
- Do not re-read docs between tests
- Cache test results in memory during session
