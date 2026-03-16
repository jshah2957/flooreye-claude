# FloorEye Skills Index
# All installed skills and frameworks
# Updated: 2026-03-16

## Core FloorEye Skills (custom)
| Skill | Description | Auto-loads when |
|-------|-------------|-----------------|
| flooreye-conventions | Coding standards | Writing any code |
| no-mocks | Prevent fake data | Writing endpoints |
| git-discipline | Commit format | Making commits |
| progress-tracking | Update progress files | Task complete |
| error-memory | Track all errors | Error occurs |
| change-tracker | Log file changes | Modifying files |
| fix-discipline | Verify fixes | Fixing bugs |
| dependency-awareness | Check dependencies | Changing files |
| smart-tester | Chunked testing | Running tests |
| session-memory | Track task state | Session start |

## External Frameworks
| Framework | Source | Files | Purpose | Use for |
|-----------|--------|-------|---------|---------|
| superpowers | obra/superpowers | 53 | Agentic methodology | Complex multi-step tasks, parallel agents, TDD |
| get-shit-done | gsd-build/get-shit-done | 170 | Spec-driven dev | Feature planning, milestones, autonomous execution |
| anthropic-skills | anthropics/skills | 372 | Official agent skills | Document generation, API integration, web apps |
| context-mode | mksglu/context-mode | 36 | Privacy context layer | Credential protection, log analysis, context savings |

## Superpowers Skills (obra/superpowers)
| Skill | Description |
|-------|-------------|
| brainstorming | Structured ideation and exploration |
| dispatching-parallel-agents | Run multiple agents concurrently |
| executing-plans | Follow structured plans step-by-step |
| finishing-a-development-branch | Complete branch work and PR prep |
| receiving-code-review | Process and apply review feedback |
| requesting-code-review | Create thorough review requests |
| subagent-driven-development | Delegate work to specialized agents |
| systematic-debugging | Methodical bug investigation |
| test-driven-development | Write tests first, then implement |
| using-git-worktrees | Isolated branches for parallel work |
| using-superpowers | Meta-skill for the framework itself |
| verification-before-completion | Final checks before marking done |
| writing-plans | Create actionable implementation plans |
| writing-skills | Create new skills for the framework |

## Superpowers Commands
| Command | Description |
|---------|-------------|
| /brainstorm | Structured brainstorming session |
| /write-plan | Create an implementation plan |
| /execute-plan | Execute a written plan step-by-step |

## Get-Shit-Done Commands (gsd-build/get-shit-done)
| Command | Description |
|---------|-------------|
| /gsd new-project | Initialize a new GSD project |
| /gsd new-milestone | Create a milestone with phases |
| /gsd add-phase | Add a phase to a milestone |
| /gsd plan-phase | Plan phase implementation |
| /gsd execute-phase | Execute a planned phase |
| /gsd validate-phase | Validate phase completion |
| /gsd complete-milestone | Mark milestone complete |
| /gsd do | Quick single-task execution |
| /gsd quick | Rapid implementation mode |
| /gsd autonomous | Full autonomous execution |
| /gsd debug | Systematic debugging |
| /gsd progress | Show current progress |
| /gsd stats | Project statistics |
| /gsd health | System health check |
| /gsd add-todo | Add a TODO item |
| /gsd check-todos | Review pending TODOs |
| /gsd add-tests | Add tests for code |
| /gsd verify-work | Verify completed work |
| /gsd cleanup | Clean up project artifacts |
| /gsd map-codebase | Map codebase structure |
| /gsd research-phase | Research before implementing |
| /gsd ui-phase | UI-specific implementation |
| /gsd ui-review | Review UI implementation |
| /gsd profile-user | Profile user preferences |
| /gsd settings | View/edit GSD settings |
| /gsd help | GSD framework help |

## Anthropic Skills (anthropics/skills)
| Skill | Description |
|-------|-------------|
| algorithmic-art | Generate algorithmic art with code |
| brand-guidelines | Create brand guidelines documents |
| canvas-design | Design canvas-based layouts |
| claude-api | Build apps with Claude API/SDK |
| doc-coauthoring | Collaborative document authoring |
| docx | Generate Word documents |
| frontend-design | Frontend UI/UX design |
| internal-comms | Internal communications drafting |
| mcp-builder | Build MCP servers |
| pdf | Generate PDF documents |
| pptx | Generate PowerPoint presentations |
| skill-creator | Create new Claude skills |
| slack-gif-creator | Create Slack GIF responses |
| theme-factory | Generate UI themes |
| web-artifacts-builder | Build web artifacts |
| webapp-testing | Test web applications |
| xlsx | Generate Excel spreadsheets |

## Context-Mode Skills (mksglu/context-mode)
| Skill | Description |
|-------|-------------|
| context-mode | Main context optimization routing |
| ctx-stats | Context savings per-tool breakdown |
| ctx-doctor | Diagnostics and health checks |
| ctx-upgrade | Update and migrate framework |
| ctx-cloud-setup | Cloud deployment configuration |
| ctx-cloud-status | Cloud service status |

## Quick Reference
- When building a new feature: use **get-shit-done** (/gsd plan-phase, /gsd execute-phase)
- When doing complex agentic work: use **superpowers** (/write-plan, /execute-plan)
- When handling credentials: use **context-mode** (ctx_execute for sensitive ops)
- When following standard patterns: use **anthropic-skills** (pdf, docx, claude-api)
- When debugging: use **superpowers** systematic-debugging or **get-shit-done** /gsd debug
- When testing: use **smart-tester** (chunked) or **superpowers** TDD
