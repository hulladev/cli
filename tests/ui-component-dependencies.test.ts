import { runCli } from "@/app/entrypoint"
import { resolveComponentDependencies } from "@/modules/ui/add/services/component-dependencies"
import type { FrameworkInstall } from "@/modules/ui/add/types"
import type { UIAddResolvedComponent } from "@/modules/ui/types"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  createScriptedPromptAdapter,
  createTerminalCollector,
} from "./cli-test-utils"

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

async function registry(
  files: Record<string, string>,
  framework = "react-native"
) {
  const root = await mkdtemp(join(tmpdir(), "hulla-component-deps-"))
  tempDirs.push(root)
  const sourceRoot = join(root, "registry")
  const frameworkRoot = join(sourceRoot, framework)
  const names = new Set<string>()
  for (const [path, content] of Object.entries(files)) {
    names.add(path.split("/")[0])
    const destination = join(frameworkRoot, path)
    await mkdir(dirname(destination), { recursive: true })
    await Bun.write(destination, content)
  }
  const install: FrameworkInstall = {
    sourceUrl: sourceRoot,
    sourceRoot,
    sourceFrameworkRoot: frameworkRoot,
    libraryName: "@hulla/ui",
    frameworkName: framework,
    templatePath: framework,
    outputPath: "src/components",
    codeRoot: "src",
    copyFilesRoot: "src",
    componentsByLowerName: new Map(
      [...names]
        .filter((name) => name !== "lib")
        .map((name) => [name.toLowerCase(), name])
    ),
  }
  function component(name: string): UIAddResolvedComponent {
    return {
      ...install,
      componentInput: name,
      componentName: name,
      sourceComponentDir: join(frameworkRoot, name),
    }
  }
  return { root, sourceRoot, frameworkRoot, install, component }
}

function names(components: UIAddResolvedComponent[]) {
  return components.map((item) => item.componentName)
}

describe("source component dependency closure", () => {
  test("installs nested imports, re-exports, lazy imports and cycles exactly once", async () => {
    const fixture = await registry({
      "date-picker/index.tsx": 'export * from "./date-picker"',
      "date-picker/date-picker.tsx":
        'import { Button } from "../button/button"; export * from "../calendar"; export const lazy = () => import("../dialog/dialog"); export const Picker = Button',
      "date-picker/parts/label.ts":
        'export type { Label } from "../../field/field"',
      "button/button.tsx": "export const Button = () => null",
      "calendar/index.tsx": 'export { DateLabel } from "./date-label"',
      "calendar/date-label.tsx":
        'import type { Label } from "../field/field"; export type DateLabel = Label',
      "dialog/dialog.tsx":
        'export { Picker } from "../date-picker/date-picker"',
      "field/field.ts": "export type Label = string",
    })
    const resolved = await resolveComponentDependencies({
      components: [
        fixture.component("date-picker"),
        fixture.component("button"),
      ],
      frameworkInstalls: [fixture.install],
    })
    expect(names(resolved)).toEqual([
      "date-picker",
      "button",
      "calendar",
      "field",
      "dialog",
    ])
    expect(
      resolved.every(
        (item) =>
          item.frameworkName === "react-native" &&
          item.outputPath === "src/components"
      )
    ).toBe(true)
  })

  test("ignores same-family imports, support aliases, external packages, and quoted/commented fake imports", async () => {
    const fixture = await registry({
      "button/index.tsx": 'export * from "./button"',
      "button/button.tsx":
        'import { Text } from "react-native"; import { theme } from "@/lib/theme"; import { helper } from "./parts/helper"; /* import type { Fake } from "../fake/fake" */ const message = `import type { Other } from "../other/other"`; export const Button = () => <Text>{message}{theme}{helper}</Text>',
      "button/parts/helper.ts": 'export const helper = <string>"ok"',
      "button/package.json": '{"dependencies":{"external-package":"1.0.0"}}',
      "lib/theme.ts": 'export const theme = "light"',
    })
    expect(
      names(
        await resolveComponentDependencies({
          components: [fixture.component("button")],
          frameworkInstalls: [fixture.install],
        })
      )
    ).toEqual(["button"])
  })

  test("discovers imports in Astro frontmatter and Svelte/Vue scripts without parsing their templates", async () => {
    for (const extension of ["astro", "svelte", "vue"]) {
      const script = 'import Button from "../button/button"'
      const fixture = await registry(
        {
          [`dialog/dialog.${extension}`]:
            extension === "astro"
              ? `---\n${script}\n---\n<Button />`
              : `<script lang="ts">${script}</script><Button />`,
          "button/button.ts": "export default () => null",
        },
        extension
      )
      expect(
        names(
          await resolveComponentDependencies({
            components: [fixture.component("dialog")],
            frameworkInstalls: [fixture.install],
          })
        )
      ).toEqual(["dialog", "button"])
    }
  })

  test("rejects imports escaping the selected framework", async () => {
    const fixture = await registry({
      "dialog/dialog.tsx": 'export * from "../../react/button/button"',
    })
    await expect(
      resolveComponentDependencies({
        components: [fixture.component("dialog")],
        frameworkInstalls: [fixture.install],
      })
    ).rejects.toThrow("escapes its framework source")
  })

  test("does not borrow a dependency from another framework", async () => {
    const native = await registry({
      "dialog/dialog.tsx": 'export * from "../button/button"',
    })
    const web = await registry(
      { "button/button.tsx": "export const Button = () => null" },
      "react"
    )
    await expect(
      resolveComponentDependencies({
        components: [native.component("dialog")],
        frameworkInstalls: [native.install, web.install],
      })
    ).rejects.toThrow("component button is unavailable for react-native")
  })

  test("rejects symlinked source families outside the framework", async () => {
    const fixture = await registry({
      "dialog/dialog.tsx": 'export * from "../button/button"',
    })
    const external = join(fixture.root, "external")
    await mkdir(external)
    await Bun.write(
      join(external, "button.tsx"),
      "export const Button = () => null"
    )
    await symlink(external, join(fixture.frameworkRoot, "button"))
    fixture.install.componentsByLowerName.set("button", "button")
    await expect(
      resolveComponentDependencies({
        components: [fixture.component("dialog")],
        frameworkInstalls: [fixture.install],
      })
    ).rejects.toThrow("escapes its framework source")
  })

  test("real ui add installs the closure while honoring a declined dependency overwrite", async () => {
    const fixture = await registry({
      "date-picker/index.tsx": 'export { DatePicker } from "./date-picker"',
      "date-picker/date-picker.tsx":
        'import { Calendar } from "../calendar/calendar"; export const DatePicker = Calendar',
      "calendar/calendar.tsx":
        'import { Button } from "../button/button"; export const Calendar = Button',
      "button/button.tsx": "export const Button = () => null",
    })
    await mkdir(join(fixture.root, ".hulla"))
    await Bun.write(
      join(fixture.sourceRoot, "ui.config.ts"),
      'export const config = { name: "@hulla/ui", version: "1", frameworks: { "react-native": "react-native" } }'
    )
    await Bun.write(
      join(fixture.root, "package.json"),
      '{"name":"consumer","private":true}'
    )
    await Bun.write(
      join(fixture.root, ".hulla/hulla.json"),
      JSON.stringify({
        cli: {
          scripts: {
            add: "/usr/bin/true",
            addDev: "/usr/bin/true",
            uninstall: "/usr/bin/true",
            upgrade: "/usr/bin/true",
          },
        },
        configs: { ui: ".hulla/ui.json" },
      })
    )
    await Bun.write(
      join(fixture.root, ".hulla/ui.json"),
      JSON.stringify({
        sources: [fixture.sourceRoot],
        installs: [
          {
            sourceUrl: fixture.sourceRoot,
            libraryName: "@hulla/ui",
            codeRoot: "src",
            componentsRoot: "src/components",
            copyFilesRoot: "src",
            frameworks: [
              {
                name: "react-native",
                templatePath: "react-native",
                tsconfigPath: "react-native/tsconfig.json",
                outputPath: "src/components",
              },
            ],
          },
        ],
        postAddUpdateStep: "",
      })
    )
    const customButton = join(fixture.root, "src/components/button/button.tsx")
    await mkdir(dirname(customButton), { recursive: true })
    await Bun.write(customButton, "export const Button = () => 'customized'")
    const collector = createTerminalCollector()
    const result = await runCli({
      argv: [
        "bun",
        "hulla",
        "ui",
        "add",
        "--framework",
        "react-native",
        "date-picker",
      ],
      runtime: {
        cwd: fixture.root,
        terminal: collector.terminal,
        prompts: createScriptedPromptAdapter([
          { kind: "confirm", value: false },
        ]),
      },
    })
    if (result.exitCode !== 0) throw new Error(collector.output())
    expect(result.exitCode).toBe(0)
    expect(
      await Bun.file(
        join(fixture.root, "src/components/date-picker/date-picker.tsx")
      ).exists()
    ).toBe(true)
    expect(
      await Bun.file(
        join(fixture.root, "src/components/calendar/calendar.tsx")
      ).exists()
    ).toBe(true)
    expect(await Bun.file(customButton).text()).toBe(
      "export const Button = () => 'customized'"
    )
    expect(collector.output()).toContain("Skipped 1 existing file")
  })
})
