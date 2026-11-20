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

  test("rejects packages outside the ecosystem", async () => {
    const result = await runCliProcess(["install", "zod"])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("hulla install accepts @hulla/* packages")
  })

  test("installs multiple development packages and applies the saved script preference", async () => {
    const dir = await createTempDir("hulla-install-setup")
    try {
      const app = join(dir, "packages/app")
      const manifest = join(app, "package.json")
      await Bun.write(
        join(dir, "package.json"),
        JSON.stringify({
          name: "workspace",
          private: true,
          workspaces: ["packages/*"],
        })
      )
      await Bun.write(
        manifest,
        JSON.stringify({
          name: "app",
          scripts: { "ui:check": "existing-check" },
        })
      )
      for (const name of ["ui", "control"]) {
        await Bun.write(
          join(dir, "packages", name, "package.json"),
          JSON.stringify({ name: `@hulla/${name}`, version: "1.0.0" })
        )
      }
      await Bun.write(
        join(app, ".hulla/hulla.json"),
        JSON.stringify({
          cli: {
            scripts: {
              add: "bun add",
              addDev: "bun add -D",
              upgrade: "bun update",
              uninstall: "bun remove",
            },
            install: { scripts: "always" },
          },
        })
      )
      const args = [
        "install",
        "@hulla/ui@workspace:*",
        "@hulla/control@workspace:*",
        "--dev",
        "--cwd",
        app,
        "--yes",
      ]
      const base = await runCliProcess([...args, "--no-scripts"])
      expect(base.exitCode).toBe(0)
      const installed = await Bun.file(manifest).json()
      expect(installed.devDependencies).toEqual({
        "@hulla/control": "workspace:*",
        "@hulla/ui": "workspace:*",
      })
      expect(installed.scripts).toEqual({ "ui:check": "existing-check" })

      const withScripts = await runCliProcess(args)
      expect(withScripts.exitCode).toBe(0)
      expect((await Bun.file(manifest).json()).scripts).toEqual({
        "ui:check": "existing-check",
        "ui:generate": "uigen",
      })
    } finally {
      await removeTempDir(dir)
    }
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

  test("installs and invokes an SDK that already supplies hulla-db", async () => {
    const dir = await createTempDir("hulla-db-bundled-cli")
    try {
      const app = join(dir, "packages/app")
      const db = join(dir, "packages/db")
      await Bun.write(
        join(dir, "package.json"),
        JSON.stringify({
          name: "workspace",
          private: true,
          packageManager: "bun",
          workspaces: ["packages/*"],
        })
      )
      await Bun.write(join(app, "package.json"), '{"name":"app"}')
      await Bun.write(
        join(db, "package.json"),
        JSON.stringify({
          name: "@hulla/db",
          version: "0.3.3",
          bin: { "hulla-db": "./cli.mjs" },
        })
      )
      await Bun.write(
        join(db, "cli.mjs"),
        "console.log(`Bundled database command ${process.argv[2]}`)"
      )

      const installed = await runCliProcess([
        "install",
        "@hulla/db@workspace:*",
        "--scripts",
        "--cwd",
        app,
        "--yes",
      ])
      expect(installed.exitCode).toBe(0)
      const manifest = await Bun.file(join(app, "package.json")).json()
      expect(manifest.devDependencies?.["@hulla/db-cli"]).toBeUndefined()
      expect(manifest.scripts?.["db:generate"]).toBe("hulla-db generate")

      const delegated = await runCliProcess(["db", "generate", "--cwd", app])
      expect(delegated.exitCode).toBe(0)
      expect(delegated.output).toBe("Bundled database command generate")
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
