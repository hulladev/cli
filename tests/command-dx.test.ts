import { runCli } from "@/app/entrypoint"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import { validateProjectDirectory } from "@/platform/fs/project-path"
import { getPathSuggestions } from "@/terminal/prompts/path-options"
import { afterEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createTerminalCollector } from "./cli-test-utils"
import { createTempDir, removeTempDir } from "./helpers"

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDir))
})
async function temporary() {
  const dir = await createTempDir("hulla-command-dx")
  dirs.push(dir)
  return dir
}

test("typed existing and new nested paths remain selectable relative to the project, even when the parent is absent", async () => {
  const root = await temporary()
  await mkdir(join(root, "src/components/ui"), { recursive: true })
  await writeFile(join(root, "blocked"), "file")
  expect(
    getPathSuggestions("src/components/ui", { root, directory: true })
  ).toContainEqual({ value: "src/components/ui", hint: "use this directory" })
  expect(
    getPathSuggestions("new/deep/components", { root, directory: true })
  ).toContainEqual({ value: "new/deep/components", hint: "create directory" })
  expect(validateProjectDirectory("new/deep/components", root)).toBeUndefined()
  const outside = await temporary()
  await symlink(outside, join(root, "external"), "dir")
  expect(
    validateProjectDirectory("external/new/components", root)
  ).toBeDefined()
  for (const value of [
    "",
    "\u007f",
    "src/\u001b[31m",
    "../outside",
    "/tmp/outside",
    "C:\\outside",
    "blocked/child",
  ]) {
    expect(validateProjectDirectory(value, root)).toBeDefined()
  }
})

test("help at every command level and bare groups never initialize a project", async () => {
  const root = await temporary()
  for (const args of [
    [],
    ["ui"],
    ["api"],
    ["--help"],
    ["ui", "--help"],
    ["ui", "init", "--help"],
    ["ui", "add", "-h"],
    ["api", "generate", "--help"],
  ]) {
    const collector = createTerminalCollector()
    const result = await runCli({
      argv: ["bun", "hulla", ...args],
      runtime: { cwd: root, terminal: collector.terminal },
    })
    expect(result.exitCode).toBe(0)
    expect(collector.output()).toContain("Usage: hulla")
    expect(await readdir(root)).toEqual([])
  }
})

test("one add command configures a workspace target, respects flags at each level, and saves paths for the next add", async () => {
  const root = await temporary()
  const project = join(root, "apps/web")
  await mkdir(project, { recursive: true })
  const fixture = join(import.meta.dir, "fixtures/ui-library-multi")
  await writeFile(
    join(project, "package.json"),
    JSON.stringify({
      name: "test-dx",
      packageManager: "bun@1.3.9",
      dependencies: { react: "^18.2.0", "@hulla/style": "^0.0.1" },
    })
  )
  await writeFile(join(project, "tsconfig.json"), '{"compilerOptions":{}}')
  const collector = createTerminalCollector()
  const originalCwd = process.cwd()
  let result = await runCli({
    argv: [
      "bun",
      "hulla",
      "--cwd",
      "apps/web",
      "--yes",
      "ui",
      "--framework",
      "react",
      "add",
      "button",
      "--source",
      fixture,
      "--code-root",
      "app/source",
      "--components-root",
      "app/source/design/ui",
      "--copy-root",
      "app/source/shared",
    ],
    runtime: { cwd: root, terminal: collector.terminal },
  })
  expect(collector.output()).not.toContain("error:")
  expect(result.exitCode).toBe(0)
  expect(process.cwd()).toBe(originalCwd)
  expect(existsSync(join(root, ".hulla"))).toBe(false)
  expect(
    await readFile(
      join(project, "app/source/design/ui/Button/index.tsx"),
      "utf8"
    )
  ).toContain("react-button")
  const config = JSON.parse(
    await readFile(join(project, ".hulla/ui.json"), "utf8")
  )
  expect(config.sources).toEqual([fixture])
  expect((await readHullaConfig(project))?.cli.cacheDir).toBe(
    join(project, ".hulla/.cache")
  )
  expect(config.installs[0]).toMatchObject({
    codeRoot: "app/source",
    componentsRoot: "app/source/design/ui",
    copyFilesRoot: "app/source/shared",
  })
  expect(
    config.installs[0].frameworks.map((item: { name: string }) => item.name)
  ).toEqual(["react"])
  result = await runCli({
    argv: ["bun", "hulla", "ui", "add", "button", "--cwd", "apps/web", "--yes"],
    runtime: { cwd: root, terminal: collector.terminal },
  })
  expect(result.exitCode).toBe(0)
  expect(process.cwd()).toBe(originalCwd)
  const replacement = pathToFileURL(fixture).href
  const replaced = await runCli({
    argv: [
      "bun",
      "hulla",
      "ui",
      "add",
      "button",
      "--cwd",
      "apps/web",
      "--source",
      replacement,
      "--framework",
      "react",
      "--yes",
    ],
    runtime: { cwd: root, terminal: collector.terminal },
  })
  expect(replaced.exitCode).toBe(0)
  const updated = JSON.parse(
    await readFile(join(project, ".hulla/ui.json"), "utf8")
  )
  expect(
    updated.installs.map((install: { sourceUrl: string }) => install.sourceUrl)
  ).toEqual([replacement])
})

test("invalid explicit output fails before project setup and restores --cwd after failure", async () => {
  const root = await temporary()
  await mkdir(join(root, "app"))
  const originalCwd = process.cwd()
  const collector = createTerminalCollector()
  const result = await runCli({
    argv: [
      "bun",
      "hulla",
      "ui",
      "init",
      "--cwd",
      "app",
      "--components-root",
      "../escape",
      "--yes",
    ],
    runtime: { cwd: root, terminal: collector.terminal },
  })
  expect(result.exitCode).toBe(1)
  expect(collector.output()).toContain(
    "--components-root: Path must stay inside the project"
  )
  expect(await readdir(join(root, "app"))).toEqual([])
  expect(process.cwd()).toBe(originalCwd)
  const removal = await runCli({
    argv: ["bun", "hulla", "ui", "remove", "button", "--cwd", "app", "--yes"],
    runtime: { cwd: root, terminal: collector.terminal },
  })
  expect(removal.exitCode).toBe(1)
  expect(await readdir(join(root, "app"))).toEqual([])
})

test("relative project config options resolve once and init writes the requested file", async () => {
  const root = await temporary()
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "test-config", packageManager: "bun@1.3.9" })
  )
  const collector = createTerminalCollector()
  for (const args of [
    ["--config", ".hulla/custom.json", "init", "--yes"],
    ["init", "--project-config", ".hulla/custom.json", "--yes"],
  ]) {
    const result = await runCli({
      argv: ["bun", "hulla", ...args],
      runtime: { cwd: root, terminal: collector.terminal },
    })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(root, ".hulla/custom.json"))).toBe(true)
    expect(existsSync(join(root, ".hulla/hulla.json"))).toBe(false)
  }
  const config = await readHullaConfig(root, ".hulla/custom.json")
  expect(config?.cli.scripts.add).toBe("bun add")
  expect(config?.cli.cacheDir).toBe(join(root, ".hulla/.cache"))
})
