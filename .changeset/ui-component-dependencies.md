---
"hulla": patch
---

Install source component dependencies recursively during `hulla ui add`, so composed components
such as native date and time pickers include the families they import. Keep dependencies within
the selected framework and source, deduplicate cycles, reject imports that escape that source,
and preserve the existing review and overwrite behavior for customized files.
