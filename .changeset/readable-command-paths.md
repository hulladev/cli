---
"hulla": minor
---

Fix typed nested directory selection, validate project-relative output paths, and add explicit UI
source/framework/output flags. Support one-command UI setup and add, workspace targeting with
`--cwd`, consistent shared options, and side-effect-free command help. Resolve project config and
cache paths against the selected project, keep generated schema defaults portable, and report
reserved commands instead of returning a misleading success.
