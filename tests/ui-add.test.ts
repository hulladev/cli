import {
  formatPostAddUpdateDiffPreview,
  parseKnownPostAddFormatter,
  runPostAddUpdateStep,
} from "@/modules/ui/add/services/dependencies"
import { findMatchesForComponent } from "@/modules/ui/add/services/selection"
import { hasMatchingContent } from "@/modules/ui/add/services/workflow"
import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("ui add selection", () => {
  test("filters matches by framework when specified", () => {
    const matches = findMatchesForComponent({
      componentInput: "button",
      explicitFramework: "react",
      frameworkInstalls: [
        {
          sourceUrl: "repo-a",
          libraryName: "ui-lib",
          frameworkName: "react",
          templatePath: "react",
          outputPath: "src/components",
          codeRoot: "src",
          copyFilesRoot: "src",
          sourceRoot: "/tmp/ui-lib",
          sourceFrameworkRoot: "/tmp/ui-lib/react",
          componentsByLowerName: new Map([["button", "Button"]]),
        },
        {
          sourceUrl: "repo-a",
          libraryName: "ui-lib",
          frameworkName: "vue",
          templatePath: "vue",
          outputPath: "src/components",
          codeRoot: "src",
          copyFilesRoot: "src",
          sourceRoot: "/tmp/ui-lib",
          sourceFrameworkRoot: "/tmp/ui-lib/vue",
          componentsByLowerName: new Map([["button", "Button"]]),
        },
      ],
    })

    expect(matches).toHaveLength(1)
    expect(matches[0]?.frameworkName).toBe("react")
  })

  test("detects unchanged existing text content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hulla-ui-add-"))
    tempDirs.push(dir)

    const filePath = join(dir, "index.tsx")
    await Bun.write(filePath, 'export * from "./button"\n')

    const matches = await hasMatchingContent(
      Bun.file(filePath),
      'export * from "./button"\n'
    )

    expect(matches).toBe(true)
  })

  test("recognizes known formatter commands", () => {
    expect(parseKnownPostAddFormatter("prettier --write {files}")).toBe(
      "prettier"
    )
    expect(parseKnownPostAddFormatter("oxfmt {files}")).toBe("oxfmt")
    expect(parseKnownPostAddFormatter("biome format --write {files}")).toBe(
      "biome"
    )
    expect(parseKnownPostAddFormatter("eslint --fix {files}")).toBeNull()
  })

  test("runs post-add formatter from project-local node_modules bin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hulla-ui-add-"))
    tempDirs.push(dir)

    await mkdir(join(dir, "node_modules", ".bin"), { recursive: true })
    const formatterPath = join(dir, "node_modules", ".bin", "prettier")
    await Bun.write(
      formatterPath,
      [
        "#!/bin/sh",
        'for arg in "$@"; do',
        '  case "$arg" in',
        "    --write) ;;",
        "    *) printf 'formatted\\n' > \"$arg\" ;;",
        "  esac",
        "done",
        "",
      ].join("\n")
    )
    await chmod(formatterPath, 0o755)

    const filePath = join(dir, "src", "button.tsx")
    await mkdir(join(dir, "src"), { recursive: true })
    await Bun.write(filePath, "raw\n")

    await runPostAddUpdateStep({
      postAddUpdateStep: "prettier --write {files}",
      projectRoot: dir,
      changedFilePaths: [filePath],
    })

    expect(await Bun.file(filePath).text()).toBe("formatted\n")
  })

  test("formats diff preview with project-local formatter without touching target file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hulla-ui-add-"))
    tempDirs.push(dir)

    await mkdir(join(dir, "node_modules", ".bin"), { recursive: true })
    const formatterPath = join(dir, "node_modules", ".bin", "prettier")
    await Bun.write(
      formatterPath,
      [
        "#!/bin/sh",
        'for arg in "$@"; do',
        '  case "$arg" in',
        "    --write) ;;",
        "    *) printf 'formatted preview\\n' > \"$arg\" ;;",
        "  esac",
        "done",
        "",
      ].join("\n")
    )
    await chmod(formatterPath, 0o755)

    const filePath = join(dir, "src", "button.tsx")
    const preview = await formatPostAddUpdateDiffPreview({
      postAddUpdateStep: "prettier --write {files}",
      projectRoot: dir,
      files: [{ path: filePath, content: "raw preview\n" }],
    })

    expect(preview.get(filePath)).toBe("formatted preview\n")
    expect(await Bun.file(filePath).exists()).toBe(false)
  })

  test("treats formatter-only differences as unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hulla-ui-add-"))
    tempDirs.push(dir)

    await mkdir(join(dir, "node_modules", ".bin"), { recursive: true })
    const formatterPath = join(dir, "node_modules", ".bin", "prettier")
    await Bun.write(
      formatterPath,
      [
        "#!/bin/sh",
        'for arg in "$@"; do',
        '  case "$arg" in',
        "    --write) ;;",
        '    *) printf \'formatted button\\n\' > "$arg" ;;',
        "  esac",
        "done",
        "",
      ].join("\n")
    )
    await chmod(formatterPath, 0o755)

    const filePath = join(dir, "src", "components", "button.tsx")
    await mkdir(join(dir, "src", "components"), { recursive: true })
    await Bun.write(filePath, "formatted button\n")

    const preview = await formatPostAddUpdateDiffPreview({
      postAddUpdateStep: "prettier --write {files}",
      projectRoot: dir,
      files: [{ path: filePath, content: "raw button\n" }],
    })

    expect(preview.get(filePath)).toBe("formatted button\n")
    expect(await Bun.file(filePath).text()).toBe("formatted button\n")
  })
})
