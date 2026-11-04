import { runCli } from "@/app/entrypoint"
import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTerminalCollector } from "./cli-test-utils"

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

test("discovers a custom registry without setup, rejects partial requests, and reapplies an explicit formatter without churn", async () => {
  const root = await mkdtemp(join(tmpdir(), "hulla-discovery-"))
  dirs.push(root)
  const registry = join(root, "registry")
  await Bun.write(
    join(root, "package.json"),
    JSON.stringify({ name: "js-app", packageManager: "bun@1.4.0" })
  )
  await Bun.write(
    join(registry, "ui.config.ts"),
    'export const config = { name: "custom-library", version: "1.0.0", frameworks: { example: "example" }, copyFiles: { shared: [{ src: "lib/bootstrap.js", required: true }] } }'
  )
  await Bun.write(
    join(registry, "example/prose/text.jsx"),
    'export const Text = () => null; //raw\nthrow new Error("Component modules must not execute during discovery")\n'
  )
  await Bun.write(
    join(registry, "example/button/button.jsx"),
    "export const Button = () => null; //raw\n"
  )
  await Bun.write(
    join(registry, "lib/bootstrap.js"),
    "export const bootstrap = true\n"
  )
  await Bun.write(
    join(registry, "example/aaa/label.jsx"),
    "export const LabelText = () => null\n"
  )
  const invoke = async (...args: string[]) => {
    const collector = createTerminalCollector()
    const result = await runCli({
      argv: ["bun", "hulla", "ui", ...args, "--yes"],
      runtime: { cwd: root, terminal: collector.terminal },
    })
    return { ...result, output: collector.output() }
  }
  const listed = await invoke(
    "search",
    "Text",
    "--source",
    registry,
    "--framework",
    "example"
  )
  expect(listed.exitCode).toBe(0)
  expect(listed.output).toContain("prose [example]")
  expect(listed.output).toContain("exports: Text")
  expect(listed.output.indexOf("prose [example]")).toBeLessThan(
    listed.output.indexOf("aaa [example]")
  )
  expect(listed.output).toContain("hulla ui add --framework example prose")
  expect(await Bun.file(join(root, ".hulla/hulla.json")).exists()).toBe(false)
  expect(
    await Bun.file(join(root, "src/components/prose/text.jsx")).exists()
  ).toBe(false)
  await Bun.write(
    join(registry, "example/prose/heading.jsx"),
    "export const Heading = () => null\n"
  )
  expect(
    (await invoke("list", "Heading", "--source", registry)).output
  ).toContain("exports: Heading, Text")

  const firstUseInvalid = await invoke(
    "add",
    "button",
    "Text",
    "--source",
    registry,
    "--framework",
    "example"
  )
  expect(firstUseInvalid.exitCode).toBe(1)
  expect(firstUseInvalid.output).toContain(
    "hulla ui add --framework example prose"
  )
  expect(await Bun.file(join(root, "src/lib/bootstrap.js")).exists()).toBe(
    false
  )
  expect(
    await Bun.file(join(root, "src/components/button/button.jsx")).exists()
  ).toBe(false)

  await Bun.write(
    join(root, "format.mjs"),
    `import { readFileSync, writeFileSync } from "node:fs"; for (const path of process.argv.slice(2)) writeFileSync(path, readFileSync(path, "utf8").replaceAll("//raw", "//formatted"))`
  )
  const initialized = await invoke(
    "init",
    "--source",
    registry,
    "--framework",
    "example",
    "--post-add-command",
    "bun format.mjs {files}"
  )
  expect(initialized.exitCode).toBe(0)
  expect(await Bun.file(join(root, "tsconfig.json")).exists()).toBe(false)
  expect(
    (await Bun.file(join(root, "package.json")).json()).devDependencies
  ).toBeUndefined()
  const invalid = await invoke(
    "add",
    "button",
    "Text",
    "--framework",
    "example"
  )
  expect(invalid.exitCode).toBe(1)
  expect(invalid.output).toContain("Unknown component families: text")
  expect(invalid.output).toContain("hulla ui add --framework example prose")
  const typo = await invoke("add", "buton", "--framework", "example")
  expect(typo.exitCode).toBe(1)
  expect(typo.output).toContain("hulla ui add --framework example button")
  expect(
    await Bun.file(join(root, "src/components/button/button.jsx")).exists()
  ).toBe(false)

  expect(
    (await invoke("add", "button", "--framework", "example")).exitCode
  ).toBe(0)
  const destination = join(root, "src/components/button/button.jsx")
  const before = await Bun.file(destination).text()
  expect(before).toContain("//formatted")
  const repeated = await invoke("add", "button", "--framework", "example")
  expect(repeated.exitCode).toBe(0)
  expect(repeated.output).toContain("1 existing file already matches")
  expect(repeated.output).not.toContain("overwritten")
  expect(await Bun.file(destination).text()).toBe(before)
  await Bun.write(
    join(root, "format.mjs"),
    'throw new Error("formatter failed")'
  )
  const failedPreview = await invoke("add", "button", "--framework", "example")
  expect(failedPreview.exitCode).toBe(1)
  expect(failedPreview.output).toContain(
    "Failed to run post add/update command"
  )
  expect(await Bun.file(destination).text()).toBe(before)
})
