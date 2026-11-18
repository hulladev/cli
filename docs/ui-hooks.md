# UI operation hooks

Configure the UI install once with `hulla ui init`. Keep its generated install records and add
`hooks` to the saved `.hulla/ui.json` when the project needs commands around UI operations:

```json
{
  "hooks": {
    "pre": ["bun run ui:prepare"],
    "post": [
      { "command": "bunx oxfmt {files}", "preview": true },
      "bun run typecheck"
    ]
  }
}
```

Use scripts that exist in the application. Commands can perform checks, code generation, file
processing or other project work. The CLI does not infer their purpose from dependency names.

## When they run

- `pre` commands run in order before `init`, `add` or `remove` performs its work. File selection has
  not happened yet, so `{files}` is not available in a pre hook.
- `post` commands run in order after that operation succeeds. An ordinary post command runs once;
  it does not run during diff previews. A project command without `{files}` also runs on a successful
  no-change operation. A command containing `{files}` is skipped when its file list is empty.
- A failed hook stops the sequence and returns a nonzero CLI result. Pre failure prevents the
  operation; post failure leaves the completed operation's files in place. There is no rollback of
  commands' external effects.
- First-use `add` can initialize the install first. That is an `init` operation followed by an `add`
  operation, each with its own hooks. Help, discovery, integration checks and doctor do not run hooks.

Hooks run from the selected app root. Project and declared workspace `node_modules/.bin` directories
are available on PATH. `{files}` expands to individually shell-quoted, project-relative paths for UI
source and configuration files changed by the operation. Removal supplies surviving updated files,
such as a stylesheet; deleted component files are not passed to a file-processing command. Dependency
manager edits and files created by hooks are not added to this list.

The child environment also contains:

| Variable             | Value                                                        |
| -------------------- | ------------------------------------------------------------ |
| `HULLA_UI_OPERATION` | `init`, `add` or `remove`                                    |
| `HULLA_UI_PHASE`     | `pre`, `post` or `preview`                                   |
| `HULLA_UI_FILES`     | JSON array of project-relative paths; empty before selection |

Prefer separate array entries to a compound shell script: the sequence stops at its first failure.

## Opt into processing preview files

An object with `preview: true` also runs on temporary incoming copies before the CLI compares an
existing file. Its command must contain `{files}` and operate only on supplied files. It may run
multiple times; use it only for deterministic file processing that tolerates temporary copies.
Formatting is one useful candidate. Notifications, publishing, project-wide generation and ordinary
validation should remain ordinary post hooks unless explicitly designed for preview execution.

During previews, `HULLA_UI_PHASE` is `preview` and both `{files}` and `HULLA_UI_FILES` point to the
temporary copies. Preview failure stops the add. Preview processing uses the same ordered subset of
post commands, so the compared source matches what those commands will produce after copying.

## CLI shortcut

`--post-add-command '<command>'` configures one ordinary post hook during setup. `{files}` is optional.
Use `--post-add-command none` to disable post hooks, or edit the config for multiple commands, pre hooks
and explicit preview processing. Routine adds reuse this configuration:

```sh
hulla ui list text
hulla ui add button typography --yes
```

Agents should inspect the saved UI/project config before adding components. Do not repeat source and
output-root setup flags on every add. Use those flags only to change configuration intentionally.
