import {
  buildFormatterPostAddCommand,
  formatPostAddUpdateDiffPreview,
  parseKnownPostAddFormatter,
  resolveFormatterExecutionPlan,
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
    expect(
      parseKnownPostAddFormatter("pnpm dlx prettier --write {files}")
    ).toBe("prettier")
    expect(parseKnownPostAddFormatter("yarn dlx oxfmt {files}")).toBe("oxfmt")
    expect(parseKnownPostAddFormatter("yarn exec oxfmt {files}")).toBe("oxfmt")
    expect(
      parseKnownPostAddFormatter("pnpm exec biome format --write {files}")
    ).toBe("biome")
  })

  test.each([
    { packageManager: "bun@1.4.0", command: "bunx", args: ["oxfmt"] },
    { packageManager: "npm@11.0.0", command: "npx", args: ["oxfmt"] },
    { packageManager: "pnpm@10.0.0", command: "pnpm", args: ["dlx", "oxfmt"] },
    { packageManager: "yarn@4.0.0", command: "yarn", args: ["dlx", "oxfmt"] },
    {
      packageManager: "yarn@1.22.22",
      command: "yarn",
      args: ["exec", "oxfmt"],
    },
  ])(
    "uses $packageManager and hoisted formatters from a nested app",
    async ({ packageManager, command, args }) => {
      const root = await mkdtemp(join(tmpdir(), "hulla-ui-workspace-"))
      tempDirs.push(root)
      const app = join(root, "apps", "mobile")
      await mkdir(app, { recursive: true })
      await Bun.write(
        join(root, "package.json"),
        JSON.stringify({
          name: "workspace",
          workspaces: ["apps/*"],
          packageManager,
          devDependencies: { oxfmt: "0.76.0" },
        })
      )
      await Bun.write(
        join(app, "package.json"),
        JSON.stringify({ name: "mobile" })
      )

      expect(
        await buildFormatterPostAddCommand({
          projectRoot: app,
          formatter: "oxfmt",
        })
      ).toBe(`${[command, ...args].join(" ")} {files}`)
      expect(await resolveFormatterExecutionPlan(app, "oxfmt")).toMatchObject({
        command,
        args,
      })

      // Package-manager exec must resolve declared tools without relying on a global PATH,
      // including Yarn PnP projects without node_modules/.bin.
      if (command === "yarn" || command === "pnpm") {
        await Bun.write(
          join(app, "package.json"),
          JSON.stringify({
            name: "mobile",
            devDependencies: { oxfmt: "0.76.0" },
          })
        )
        expect(await resolveFormatterExecutionPlan(app, "oxfmt")).toMatchObject(
          {
            command,
            args: ["exec", "oxfmt"],
          }
        )
      }

      // Once installed at the root, execute that binary instead of downloading one.
      const binary = join(
        root,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "oxfmt.cmd" : "oxfmt"
      )
      await Bun.write(binary, "#!/bin/sh\nexit 0\n")
      expect((await resolveFormatterExecutionPlan(app, "oxfmt")).command).toBe(
        binary
      )
    }
  )

  test("recognizes Yarn Classic from its workspace lockfile without a version declaration", async () => {
    const root = await mkdtemp(join(tmpdir(), "hulla-ui-yarn-classic-"))
    tempDirs.push(root)
    const app = join(root, "apps/mobile")
    await mkdir(app, { recursive: true })
    await Bun.write(
      join(root, "package.json"),
      JSON.stringify({ name: "workspace", workspaces: ["apps/*"] })
    )
    await Bun.write(
      join(root, "yarn.lock"),
      "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.\n# yarn lockfile v1\n"
    )
    await Bun.write(
      join(app, "package.json"),
      JSON.stringify({ name: "mobile" })
    )

    expect(
      await buildFormatterPostAddCommand({
        projectRoot: app,
        formatter: "oxfmt",
      })
    ).toBe("yarn exec oxfmt {files}")
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
        "    *) printf 'formatted button\\n' > \"$arg\" ;;",
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
