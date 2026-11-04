import { runCli } from "@/app/entrypoint"
import { inspectIntegrations } from "@/checks/run"
import { afterEach, expect, test } from "bun:test"
import {
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  createScriptedPromptAdapter,
  createTerminalCollector,
} from "./cli-test-utils"
import { createTempDir, removeTempDir } from "./helpers"

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDir))
})

async function temporary() {
  const root = await createTempDir("hulla-checks")
  dirs.push(root)
  return root
}

async function json(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}

async function install(
  root: string,
  name: string,
  version: string,
  extra = {}
) {
  const path = join(root, "node_modules", name)
  await json(join(path, "package.json"), {
    name,
    version,
    exports: { ".": "./index.js" },
    ...extra,
  })
  // Runtime resolution must work without ever evaluating this entrypoint.
  await writeFile(
    join(path, "index.js"),
    `throw new Error("Check imported ${name}")`
  )
  return path
}

async function invoke(root: string, args: string[]) {
  const collector = createTerminalCollector()
  const result = await runCli({
    argv: ["bun", "hulla", ...args],
    runtime: {
      cwd: root,
      terminal: collector.terminal,
      prompts: createScriptedPromptAdapter([]),
    },
  })
  return { ...result, output: collector.output() }
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  async function visit(path: string) {
    for (const entry of await readdir(join(root, path), {
      withFileTypes: true,
    })) {
      const local = join(path, entry.name)
      if (entry.isDirectory()) await visit(local)
      else if (entry.isFile())
        files[local] = await readFile(join(root, local), "utf8")
    }
  }
  await visit("")
  return files
}

test("doctor detects declared integrations across workspaces, skips excluded/unrelated packages, and only reads files", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), {
    name: "root",
    workspaces: { packages: ["apps/*", "packages/**", "!apps/excluded"] },
  })
  const mobile = join(root, "apps/mobile")
  await json(join(mobile, "package.json"), {
    name: "mobile",
    dependencies: {
      "@hulla/style": "0.5.0",
      "@hulla/style-native": "1.0.0",
      react: "19.0.0",
      "react-native": "0.88.0",
    },
  })
  await install(root, "@hulla/style", "0.5.0")
  await install(mobile, "@hulla/style-native", "1.0.0", {
    peerDependencies: {
      "@hulla/style": "^0.5.0",
      "react-native": ">=0.81.0 <1.0.0",
    },
  })
  await install(root, "react", "19.0.0")
  await install(root, "react-native", "0.88.0")
  await json(join(mobile, ".hulla/ui.json"), {
    installs: [
      {
        sourceUrl: "https://registry.invalid/generated",
        libraryName: "@hulla/ui",
        codeRoot: "src",
        componentsRoot: "src/components/ui",
        copyFilesRoot: "src",
        frameworks: [
          {
            name: "react-native",
            templatePath: "react-native",
            outputPath: "src/components/ui",
            tsconfigPath: "tsconfig.json",
          },
        ],
      },
    ],
  })
  await json(join(root, "tsconfig.base.json"), {
    compilerOptions: { paths: { "@/*": ["./apps/mobile/src/*"] } },
  })
  await json(join(mobile, "tsconfig.json"), {
    extends: "../../tsconfig.base.json",
  })
  const server = join(root, "apps/server")
  await json(join(server, "package.json"), {
    name: "server",
    dependencies: { "@hulla/api": "2.0.0", "@hulla/control": "0.1.0" },
  })
  await install(server, "@hulla/api", "2.0.0")
  const control = await install(server, "@hulla/control", "0.1.0")
  const domain = join(root, "packages/domain")
  await json(join(domain, "package.json"), {
    name: "domain",
    dependencies: { "@hulla/control": "0.1.0" },
  })
  await mkdir(join(domain, "node_modules/@hulla"), { recursive: true })
  await symlink(control, join(domain, "node_modules/@hulla/control"), "dir")
  await json(join(root, "apps/excluded/package.json"), {
    dependencies: { "@hulla/db": "0.1.2" },
  })
  await json(join(root, "unrelated/package.json"), {
    dependencies: { "@hulla/db": "0.1.2" },
  })
  const before = await snapshot(root)
  const result = await invoke(root, ["doctor"])
  expect(result.exitCode).toBe(0)
  for (const name of [
    "mobile (apps/mobile) — ui",
    "mobile (apps/mobile) — style",
    "server (apps/server) — api",
    "domain (packages/domain) — control",
  ])
    expect(result.output).toContain(name)
  expect(result.output).not.toContain(" — db")
  expect(result.output).not.toContain("Check imported")
  expect(await snapshot(root)).toEqual(before)
  // --cwd must constrain discovery to the selected app and restore process cwd.
  const cwd = process.cwd()
  const scoped = await invoke(root, ["ui", "--check", "--cwd", "apps/mobile"])
  expect(scoped.exitCode).toBe(0)
  expect(scoped.output).toContain("@/* resolves to src/*")
  expect(scoped.output).not.toContain(" — control")
  expect(process.cwd()).toBe(cwd)
})

test("an adapter's incompatible installed peer fails --check and doctor still checks other integrations", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), {
    name: "server",
    dependencies: {
      "@hulla/api": "2.0.0",
      "@hulla/api-hono": "2.0.0",
      "@hulla/control": "0.1.0",
    },
  })
  await install(root, "@hulla/api", "2.0.0")
  await install(root, "@hulla/api-hono", "2.0.0", {
    peerDependencies: { "@hulla/api": "^3.0.0", hono: "^4.0.0" },
  })
  await install(root, "@hulla/control", "0.1.0")
  const checked = await invoke(root, ["--check", "api"])
  expect(checked.exitCode).toBe(1)
  expect(checked.output).toContain("requires @hulla/api@^3.0.0; found 2.0.0")
  expect(checked.output).toContain(
    "requires peer hono@^4.0.0, which is not installed"
  )
  expect(checked.output).not.toContain(" — control")
  const doctor = await invoke(root, ["doctor"])
  expect(doctor.exitCode).toBe(1)
  expect(doctor.output).toContain("PASS @hulla/control@0.1.0 is installed")
  expect(await readdir(root)).not.toContain(".hulla")
})

test("absent integrations skip, while declared missing packages and broken runtime exports fail", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), { name: "app" })
  expect(await invoke(root, ["db", "--check"])).toMatchObject({
    exitCode: 0,
    output: expect.stringContaining("SKIPPED No db integration detected"),
  })
  await json(join(root, "package.json"), {
    name: "app",
    dependencies: { "@hulla/db": "0.1.2" },
  })
  expect(await invoke(root, ["db", "--check"])).toMatchObject({
    exitCode: 1,
    output: expect.stringContaining("@hulla/db is not installed"),
  })
  const path = await install(root, "@hulla/db", "0.1.2")
  await rm(join(path, "index.js"))
  expect(await invoke(root, ["db", "--check"])).toMatchObject({
    exitCode: 1,
    output: expect.stringContaining("no resolvable runtime entrypoint"),
  })
})

test("optional absent peers are skipped, but incompatible present peers and stale installs fail", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), {
    name: "app",
    dependencies: { "@hulla/db": "0.1.2" },
  })
  await install(root, "@hulla/db", "0.1.2", {
    peerDependencies: { zod: "^4.0.0" },
    peerDependenciesMeta: { zod: { optional: true } },
  })
  expect((await invoke(root, ["db", "--check"])).exitCode).toBe(0)
  await writeFile(join(root, "db.config.ts"), "export default { broken: }")
  expect((await invoke(root, ["db", "--check"])).exitCode).toBe(1)
  await writeFile(
    join(root, "db.config.ts"),
    'throw new Error("DB config executed")'
  )
  expect(await invoke(root, ["db", "--check"])).toMatchObject({
    exitCode: 0,
    output: expect.stringContaining(
      "configuration values and connectivity were not evaluated"
    ),
  })
  await install(root, "zod", "3.0.0")
  expect(await invoke(root, ["db", "--check"])).toMatchObject({
    exitCode: 1,
    output: expect.stringContaining("requires zod@^4.0.0; found 3.0.0"),
  })
  await json(join(root, "package.json"), {
    name: "app",
    dependencies: { "@hulla/db": "0.2.0" },
  })
  expect(await invoke(root, ["db", "--check"])).toMatchObject({
    exitCode: 1,
    output: expect.stringContaining("does not satisfy declared 0.2.0"),
  })
})

test("invalid UI config is reported without suppressing the remaining integrations", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), {
    name: "app",
    dependencies: { "@hulla/control": "0.1.0" },
  })
  await install(root, "@hulla/control", "0.1.0")
  await json(join(root, ".hulla/ui.json"), { installs: "invalid" })
  const result = await invoke(root, ["doctor"])
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain(" — ui")
  expect(result.output).toContain("PASS @hulla/control@0.1.0")
})

test("UI checks reject escaping saved paths and aliases that point away from the code root", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), { name: "app" })
  await json(join(root, ".hulla/ui.json"), {
    installs: [
      {
        sourceUrl: "./registry",
        libraryName: "custom",
        codeRoot: "src",
        componentsRoot: "../outside",
        copyFilesRoot: "src",
        frameworks: [
          {
            name: "react",
            templatePath: "react",
            outputPath: "../outside",
            tsconfigPath: "tsconfig.json",
          },
        ],
      },
    ],
  })
  await json(join(root, "tsconfig.json"), {
    compilerOptions: { paths: { "@/*": ["./wrong/*"] } },
  })
  const result = await invoke(root, ["ui", "--check"])
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain("Path must stay inside the project")
  expect(result.output).toContain(
    "@/* must resolve to the configured code root"
  )
})

test("explicit API config is checked without running it, and warnings do not fail CI", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), {
    name: "app",
    dependencies: { "@hulla/api": "2.0.0" },
  })
  await install(root, "@hulla/api", "2.0.0")
  await writeFile(
    join(root, "api.custom.ts"),
    'throw new Error("Config executed")'
  )
  const result = await invoke(root, [
    "api",
    "--check",
    "--config",
    "api.custom.ts",
  ])
  expect(result.exitCode).toBe(0)
  expect(result.output).toContain("WARNING")
  expect(result.output).not.toContain("Config executed")
  await writeFile(join(root, "api.invalid.ts"), "export default { broken: }")
  expect(
    (await invoke(root, ["api", "--check", "--config", "api.invalid.ts"]))
      .exitCode
  ).toBe(1)
  expect(
    await invoke(root, ["api", "--check", "--config", "missing.ts"])
  ).toMatchObject({
    exitCode: 1,
    output: expect.stringContaining("Configured API generator file is missing"),
  })
})

test("broken workspace manifests are reported without blocking siblings, and explicit project configs only target the selected package", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), {
    name: "root",
    workspaces: ["packages/*"],
  })
  await json(join(root, ".hulla/custom.json"), {
    cli: {
      scripts: {
        add: "bun add",
        addDev: "bun add -D",
        uninstall: "bun remove",
        upgrade: "bun update",
      },
    },
    configs: { ui: ".hulla/missing.json", api: "missing-api.ts" },
  })
  await json(join(root, "packages/broken/package.json"), {})
  await writeFile(join(root, "packages/broken/package.json"), "{invalid")
  await json(join(root, "packages/good/package.json"), {
    name: "good",
    dependencies: { "@hulla/control": "0.1.0" },
  })
  await install(root, "@hulla/control", "0.1.0")
  for (const args of [
    ["--config", ".hulla/custom.json", "doctor"],
    ["doctor", "--project-config", ".hulla/custom.json"],
  ]) {
    const result = await invoke(root, args)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("packages/broken")
    expect(result.output).toContain("PASS @hulla/control@0.1.0")
    expect(result.output).toContain("UI source is not configured")
    expect(result.output).toContain("Configured API generator file is missing")
    expect(result.output).not.toContain("Project config not found")
  }
})

test("a configured UI without its required dependencies fails, even when a registry generator dependency is absent", async () => {
  const root = await temporary()
  await json(join(root, "package.json"), { name: "app" })
  await json(join(root, ".hulla/ui.json"), {
    installs: [
      {
        sourceUrl: "./registry",
        libraryName: "@hulla/ui",
        codeRoot: "src",
        componentsRoot: "src/components",
        copyFilesRoot: "src",
        frameworks: [
          {
            name: "react-native",
            templatePath: "react-native",
            outputPath: "src/components",
            tsconfigPath: "tsconfig.json",
          },
        ],
      },
    ],
  })
  await json(join(root, "tsconfig.json"), {
    compilerOptions: { paths: { "@/*": ["./src/*"] } },
  })
  const reports = await inspectIntegrations({ cwd: root })
  const failures = reports
    .flatMap((report) => report.results)
    .filter((result) => result.status === "failure")
  expect(
    failures.some((result) =>
      result.message.includes("@hulla/style-native is required")
    )
  ).toBe(true)
  expect(
    failures.some((result) =>
      result.message.includes("@hulla/ui is not installed")
    )
  ).toBe(false)
})
