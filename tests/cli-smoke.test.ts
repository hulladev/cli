import { describe, expect, test } from "bun:test"
import { realpath } from "node:fs/promises"
import { join } from "node:path"
import packageJson from "../package.json"
import { createTempDir, removeTempDir } from "./helpers"

const PROJECT_ROOT = join(import.meta.dir, "..")

describe("cli smoke", () => {
  test("prints version through the real process entrypoint", async () => {
    const result = await runCliProcess(["--version"])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(`hulla v${packageJson.version}`)
  })

  test("returns a parser failure through the real process entrypoint", async () => {
    const result = await runCliProcess(["wat"])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Unhandled argument: wat")
  })

  test("rejects unrelated packages through the database installer", async () => {
    const result = await runCliProcess(["install", "@hulla/control"])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("hulla install supports one @hulla/db")
  })

  test("installs database tooling as a workspace dev dependency and adds scripts on opt-in", async () => {
    const dir = await createTempDir("hulla-db-install")
    try {
      const rootManifest = join(dir, "package.json")
      const server = join(dir, "packages/server")
      const serverManifest = join(server, "package.json")
      const scripts = { dev: "bun --watch src.ts", "db:generate": "bun gen.ts" }
      await Bun.write(
        rootManifest,
        JSON.stringify({
          name: "workspace",
          private: true,
          packageManager: "bun",
          workspaces: ["packages/*"],
        })
      )
      await Bun.write(
        join(dir, "packages/db/package.json"),
        JSON.stringify({ name: "@hulla/db", version: "0.3.4" })
      )
      await Bun.write(
        join(dir, "packages/db-cli/package.json"),
        JSON.stringify({ name: "@hulla/db-cli", version: "0.3.4" })
      )
      await Bun.write(
        serverManifest,
        JSON.stringify({ name: "server", scripts })
      )

      const args = [
        "install",
        "@hulla/db@workspace:*",
        "--cwd",
        server,
        "--yes",
      ]
      const install = await runCliProcess(args)
      expect(install.exitCode).toBe(0)
      const installed = await Bun.file(serverManifest).json()
      expect(installed.dependencies).toEqual({ "@hulla/db": "workspace:*" })
      expect(installed.devDependencies).toEqual({
        "@hulla/db-cli": "workspace:*",
      })
      expect(installed.scripts).toEqual(scripts)

      const optIn = await runCliProcess([...args, "--db-scripts"])
      expect(optIn.exitCode).toBe(0)
      expect((await Bun.file(serverManifest).json()).scripts).toEqual({
        ...scripts,
        "db:dev": "hulla-db dev",
      })
      expect((await Bun.file(rootManifest).json()).scripts).toBeUndefined()
    } finally {
      await removeTempDir(dir)
    }
  })

  test("delegates to the workspace CLI and preserves arguments and exit status", async () => {
    const dir = await createTempDir("hulla-db-proxy")
    try {
      const app = join(dir, "apps/server")
      await Bun.write(join(app, "package.json"), '{"name":"server"}')
      const cli = join(dir, "node_modules/@hulla/db-cli")
      await Bun.write(
        join(cli, "package.json"),
        JSON.stringify({
          name: "@hulla/db-cli",
          version: "0.3.4",
          exports: {},
          bin: { "hulla-db": "./commands.mjs" },
        })
      )
      await Bun.write(
        join(cli, "commands.mjs"),
        `console.log(JSON.stringify([process.cwd(), ...process.argv.slice(2)]))
process.exit(23)`
      )

      const result = await runCliProcess([
        "db",
        "migrate",
        "db entry.ts",
        "--check",
        "--cwd",
        app,
      ])
      expect(result.exitCode).toBe(23)
      expect(JSON.parse(result.output)).toEqual([
        await realpath(app),
        "migrate",
        "db entry.ts",
        "--check",
      ])
    } finally {
      await removeTempDir(dir)
    }
  })
})

async function runCliProcess(args: string[]): Promise<{
  exitCode: number
  output: string
}> {
  const proc = Bun.spawn([process.execPath, "src/bin/index.ts", ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return {
    exitCode,
    output: `${stdout}\n${stderr}`.trim(),
  }
}
