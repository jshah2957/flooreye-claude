---
name: session-memory
description: Tracks exact task state so sessions can resume instantly without re-reading everything
invocation: auto
---
# Session Memory Rules

## What to track after EVERY task
After each task completes, write a one-line entry to .claude/state.md:

Format:
[datetime] | Session [N] | Task [N] | DONE | [filename] | [commit hash]

## What to track when interrupted
If a session ends mid-task, write to .claude/state.md:

Format:
[datetime] | Session [N] | Task [N] | INTERRUPTED | [what was done] | [what remains]

## On session start
Read .claude/state.md last 5 lines only.
This is faster than reading CLAUDE.md and PROGRESS.md fully.
Use these 5 lines to restore state instantly.

## state.md location
C:\Users\jshah\flooreye\.claude\state.md
