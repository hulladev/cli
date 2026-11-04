import { runCli } from "@/app/entrypoint"
import { afterEach, describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import {
  createScriptedPromptAdapter,
  createTerminalCollector,
} from "./cli-test-utils"
import { createTempDir, removeTempDir } from "./helpers"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(removeTempDir))
})

const commands = [
  "",
  "init",
  "install",
  "api",
  "api init",
  "api generate",
  "api dev",
  "ui",
  "ui init",
  "ui add",
  "ui remove",
  "ui list",
]

async function requestHelp(args: string[]) {
  const dir = await createTempDir("hulla-cli-help")
  tempDirs.push(dir)
  const collector = createTerminalCollector()
  const result = await runCli({
    argv: ["bun", "hulla", ...args],
    runtime: {
      cwd: dir,
      terminal: collector.terminal,
      prompts: createScriptedPromptAdapter([]),
    },
  })

  expect(result.exitCode).toBe(0)
  expect(collector.events.some((event) => event.type === "error")).toBe(false)
  expect(await readdir(dir)).toEqual([])
  return collector.output()
}

describe("cli help", () => {
  for (const flag of ["--help", "-h"]) {
    test.each(commands)(
      `${flag} for '%s' bypasses project setup`,
      async (path) => {
        const output = await requestHelp([
          ...path.split(" ").filter(Boolean),
          flag,
        ])

        expect(output).toContain(`Usage: hulla${path ? ` ${path}` : ""} `)
        expect(output).toContain("--help")
        expect(output).not.toContain("not implemented")
      }
    )
  }

  test.each([
    ["initialize", "init"],
    ["i", "install"],
    ["add", "install"],
    ["ui i", "ui init"],
    ["ui a", "ui add"],
    ["ui r", "ui remove"],
    ["ui search", "ui list"],
  ])("alias '%s' shows canonical help for '%s'", async (alias, path) => {
    const output = await requestHelp([...alias.split(" "), "--help"])
    expect(output).toContain(`Usage: hulla ${path} `)
    expect(output).toContain("Aliases:")
    expect(output).toContain(alias.split(" ").at(-1)!)
  })

  for (const args of [
    ["--help", "ui", "add"],
    ["ui", "--help", "add"],
    ["ui", "add", "button", "-yh"],
    ["ui", "add", "--config", "missing.json", "--help"],
    ["--config", "missing.json", "ui", "add", "--help"],
  ]) {
    test(`resolves the selected command for '${args.join(" ")}'`, async () => {
      const output = await requestHelp(args)
      expect(output).toContain("Usage: hulla ui add [components...] [options]")
      expect(output).toContain("--framework <value>")
      expect(output).toContain("Arguments:")
      expect(output).not.toContain("Commands:")
    })
  }

  test("root and group help list commands, while leaf help lists its options", async () => {
    const root = await requestHelp(["--help"])
    expect(root).toContain("Commands:")
    for (const name of ["init", "install", "api", "ui"]) {
      expect(root).toContain(name)
    }
    expect(root).toContain("--version")

    const api = await requestHelp(["api", "--help"])
    expect(api).toContain("generate")
    expect(api).toContain("dev")
    expect(api).toContain("init")

    const init = await requestHelp(["init", "--help"])
    expect(init).toContain("--clean")
    expect(init).toContain("--config <value>")
    expect(init).toContain("--yes")
    expect(init).not.toContain("--framework")
  })
})
