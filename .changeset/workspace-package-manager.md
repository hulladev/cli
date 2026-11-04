---
"hulla": patch
---

Detect the containing workspace's package manager during project initialization and UI formatter
selection, and resolve hoisted formatter binaries. Report detection sources and stale lockfiles;
reject ambiguous lockfiles and missing manager evidence in non-interactive initialization instead
of silently selecting npm. Keep application install targets and existing custom scripts intact.
Use pnpm/Yarn dlx for uninstalled formatters and exec for declared tools; keep Yarn Classic on
exec because it does not support dlx. Preserve formatter previews for these command forms.
