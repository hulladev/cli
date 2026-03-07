import { runCli } from "@/app/entrypoint"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createScriptedPromptAdapter, createTerminalCollector } from "./cli-test-utils"
import { createTempDir, removeTempDir } from "./helpers"

const tempDirs: string[] = []

const SINGLE_FIXTURE_PATH = join(import.meta.dir, "fixtures/ui-library-single")
const MULTI_FIXTURE_PATH = join(import.meta.dir, "fixtures/ui-library-multi")

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(removeTempDir))
})

describe("cli integration", () => {
  test("reports no command selected for bare hulla", async () => {
    const collector = createTerminalCollector()

    const result = await runCli({
      argv: ["bun", "hulla"],
      runtime: {
        terminal: collector.terminal,
        cwd: import.meta.dir,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(collector.output()).toContain("outro:No command selected.")
  })

  test("initializes config in non-interactive mode", async () => {
    const dir = await createTempDir("hulla-cli-init")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-init",
      version: "1.0.0",
      packageManager: "bun@1.3.9",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "init", "--yes"],
      runtime: {
        terminal: collector.terminal,
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(0)

    const config = JSON.parse(
      await readFile(join(dir, ".hulla", "hulla.json"), "utf8")
    ) as {
      cli: {
        scripts: {
          add: string
          addDev: string
          uninstall: string
          upgrade: string
        }
      }
    }

    expect(config.cli.scripts).toEqual({
      add: "bun add",
      addDev: "bun add -D",
      uninstall: "bun remove",
      upgrade: "bun update",
    })
    expect(collector.output()).toContain(
      "outro: @hulla/cli  Project was sucessfully initialized"
    )
  })

  test("overwrites an existing config when confirmed", async () => {
    const dir = await createTempDir("hulla-cli-overwrite")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-overwrite",
      version: "1.0.0",
      packageManager: "bun@1.3.9",
    })
    await writeHullaConfig(dir, {
      add: "npm install",
      addDev: "npm install -D",
      uninstall: "npm uninstall",
      upgrade: "npm update",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "init"],
      runtime: {
        terminal: collector.terminal,
        prompts: createScriptedPromptAdapter([
          { kind: "confirm", value: true },
          { kind: "select", value: "use" },
        ]),
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(0)

    const config = JSON.parse(
      await readFile(join(dir, ".hulla", "hulla.json"), "utf8")
    ) as {
      cli: {
        scripts: {
          add: string
          addDev: string
          uninstall: string
          upgrade: string
        }
      }
    }

    expect(config.cli.scripts.add).toBe("bun add")
    expect(config.cli.scripts.uninstall).toBe("bun remove")
  })

  test("captures manual init script values through scripted prompts", async () => {
    const dir = await createTempDir("hulla-cli-manual")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-manual",
      version: "1.0.0",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "init"],
      runtime: {
        terminal: collector.terminal,
        prompts: createScriptedPromptAdapter([
          { kind: "confirm", value: true },
          { kind: "select", value: "other" },
          { kind: "text", value: "npm install" },
          { kind: "text", value: "npm install -D" },
          { kind: "text", value: "npm uninstall" },
          { kind: "text", value: "npm update" },
          { kind: "select", value: "use" },
        ]),
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(0)

    const config = JSON.parse(
      await readFile(join(dir, ".hulla", "hulla.json"), "utf8")
    ) as {
      cli: {
        scripts: {
          add: string
          addDev: string
          uninstall: string
          upgrade: string
        }
      }
    }

    expect(config.cli.scripts).toEqual({
      add: "npm install",
      addDev: "npm install -D",
      uninstall: "npm uninstall",
      upgrade: "npm update",
    })
  })

  test("configures ui from an offline fixture source in non-interactive mode", async () => {
    const dir = await createTempDir("hulla-cli-ui-init")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-ui-init",
      version: "1.0.0",
      packageManager: "bun@1.3.9",
      dependencies: {
        react: "^18.2.0",
      },
    })
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: {} }, null, 2)
    )
    await writeFile(
      join(dir, "vite.config.ts"),
      ['import { defineConfig } from "vite"', "", "export default defineConfig({})", ""].join("\n")
    )
    await writeHullaConfig(dir)
    await writeUiConfig(dir, {
      version: 1,
      sources: [SINGLE_FIXTURE_PATH],
      installs: [],
      postAddUpdateStep: "",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "ui", "init", "--yes"],
      runtime: {
        terminal: collector.terminal,
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(0)

    const uiConfig = JSON.parse(
      await readFile(join(dir, ".hulla", "ui.json"), "utf8")
    ) as {
      installs: Array<{
        sourceUrl: string
        codeRoot: string
        componentsRoot: string
        copyFilesRoot: string
        frameworks: Array<{ name: string; templatePath: string; outputPath: string }>
      }>
      postAddUpdateStep: string
    }
    const tsconfig = await readFile(join(dir, "tsconfig.json"), "utf8")
    const viteConfig = await readFile(join(dir, "vite.config.ts"), "utf8")

    expect(uiConfig.installs).toHaveLength(1)
    expect(uiConfig.installs[0]?.sourceUrl).toBe(SINGLE_FIXTURE_PATH)
    expect(uiConfig.installs[0]?.frameworks[0]?.name).toBe("react")
    expect(uiConfig.postAddUpdateStep).toBe("")
    expect(tsconfig).toContain('"@/*"')
    expect(viteConfig).toContain('alias: { "@": "/src" }')
    expect(collector.output()).toContain("outro: @hulla/cli  UI command executed")
  })

  test("uses scripted framework selection for ambiguous ui add", async () => {
    const dir = await createTempDir("hulla-cli-ui-add")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-ui-add",
      version: "1.0.0",
      packageManager: "bun@1.3.9",
    })
    await writeHullaConfig(dir)
    await writeUiConfig(dir, {
      version: 1,
      sources: [MULTI_FIXTURE_PATH],
      installs: [
        {
          sourceUrl: MULTI_FIXTURE_PATH,
          libraryName: "fixture-multi",
          codeRoot: "src",
          componentsRoot: "src/components",
          copyFilesRoot: "src",
          frameworks: [
            {
              name: "react",
              templatePath: "react",
              outputPath: "src/components",
              tsconfigPath: "tsconfig.json",
            },
            {
              name: "vue",
              templatePath: "vue",
              outputPath: "src/components",
              tsconfigPath: "tsconfig.json",
            },
          ],
        },
      ],
      postAddUpdateStep: "",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "ui", "add", "button"],
      runtime: {
        terminal: collector.terminal,
        prompts: createScriptedPromptAdapter([
          { kind: "select", value: "react" },
        ]),
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(
      await readFile(join(dir, "src", "components", "Button", "index.tsx"), "utf8")
    ).toContain("react-button")
  })

  test("fails in --yes mode when ui add still needs component input", async () => {
    const dir = await createTempDir("hulla-cli-ui-add-yes")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-ui-add-yes",
      version: "1.0.0",
      packageManager: "bun@1.3.9",
    })
    await writeHullaConfig(dir)
    await writeUiConfig(dir, {
      version: 1,
      sources: [SINGLE_FIXTURE_PATH],
      installs: [
        {
          sourceUrl: SINGLE_FIXTURE_PATH,
          libraryName: "fixture-single",
          codeRoot: "src",
          componentsRoot: "src/components",
          copyFilesRoot: "src",
          frameworks: [
            {
              name: "react",
              templatePath: "react",
              outputPath: "src/components",
              tsconfigPath: "tsconfig.json",
            },
          ],
        },
      ],
      postAddUpdateStep: "",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "ui", "add", "--yes"],
      runtime: {
        terminal: collector.terminal,
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(1)
    expect(collector.output()).toContain("component input is required")
  })

  test("fails in --yes mode when ui add cannot resolve an ambiguous framework", async () => {
    const dir = await createTempDir("hulla-cli-ui-add-ambiguous")
    tempDirs.push(dir)
    const collector = createTerminalCollector()

    await writeProjectPackageJson(dir, {
      name: "demo-ui-add-ambiguous",
      version: "1.0.0",
      packageManager: "bun@1.3.9",
    })
    await writeHullaConfig(dir)
    await writeUiConfig(dir, {
      version: 1,
      sources: [MULTI_FIXTURE_PATH],
      installs: [
        {
          sourceUrl: MULTI_FIXTURE_PATH,
          libraryName: "fixture-multi",
          codeRoot: "src",
          componentsRoot: "src/components",
          copyFilesRoot: "src",
          frameworks: [
            {
              name: "react",
              templatePath: "react",
              outputPath: "src/components",
              tsconfigPath: "tsconfig.json",
            },
            {
              name: "vue",
              templatePath: "vue",
              outputPath: "src/components",
              tsconfigPath: "tsconfig.json",
            },
          ],
        },
      ],
      postAddUpdateStep: "",
    })

    const result = await runCli({
      argv: ["bun", "hulla", "ui", "add", "button", "--yes"],
      runtime: {
        terminal: collector.terminal,
        cwd: dir,
      },
    })

    expect(result.exitCode).toBe(1)
    expect(collector.output()).toContain("exists in multiple frameworks")
  })
})

async function writeProjectPackageJson(
  dir: string,
  contents: Record<string, unknown>
): Promise<void> {
  await writeFile(join(dir, "package.json"), JSON.stringify(contents, null, 2))
}

async function writeHullaConfig(
  dir: string,
  scripts: {
    add: string
    addDev: string
    uninstall: string
    upgrade: string
  } = {
    add: "/usr/bin/true",
    addDev: "/usr/bin/true",
    uninstall: "/usr/bin/true",
    upgrade: "/usr/bin/true",
  }
): Promise<void> {
  await mkdir(join(dir, ".hulla"), { recursive: true })
  await writeFile(
    join(dir, ".hulla", "hulla.json"),
    JSON.stringify(
      {
        cli: {
          scripts,
        },
        configs: {
          ui: ".hulla/ui.json",
        },
      },
      null,
      2
    )
  )
}

async function writeUiConfig(
  dir: string,
  config: {
    version: number
    sources: string[]
    installs: unknown[]
    postAddUpdateStep: string
  }
): Promise<void> {
  await mkdir(join(dir, ".hulla"), { recursive: true })
  await writeFile(
    join(dir, ".hulla", "ui.json"),
    JSON.stringify(config, null, 2)
  )
}
