---
"hulla": patch
---

Keep the generated cache directory default relative and resolve cache paths from the selected project's config location at runtime. Preserve custom relative cache paths when saving configuration so worktrees and other checkouts do not inherit another checkout's absolute cache path.
