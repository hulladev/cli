---
"hulla": minor
---

Add read-only integration-owned `--check` commands for UI, style, API, db, and control. Add a thin
`doctor` coordinator that detects declared integrations across workspaces and runs the same checks.
Report local package/peer compatibility, UI paths and inherited TypeScript aliases, and optional
API/db config syntax without prompts, project-code evaluation, network access, or file changes.
Return a failing exit status when checks fail, while continuing other integrations and workspaces.
