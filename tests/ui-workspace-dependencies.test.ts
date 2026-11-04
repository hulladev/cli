import { installComponentDependencies } from "@/modules/ui/add/services/dependencies"
import { createUiDepsTask } from "@/modules/ui/init/services/dependencies"
import { classifyWorkspaceDevDependencies } from "@/modules/ui/shared/workspace-dependencies"
import { resolveHullaConfig } from "@/platform/config/resolve-hulla-config"
import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

test("init and add reuse declared workspace dev tools, keep runtime deps local, and reject incompatible root tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "hulla-workspace-deps-"))
  dirs.push(root)
  await mkdir(join(root, ".git"))
  const app = join(root, "apps/mobile")
  await Bun.write(join(app, "package.json"), JSON.stringify({ name: "mobile" }))
  const rootPackage = {
    name: "workspace",
    workspaces: ["apps/*"],
    devDependencies: { "custom-checker": "2.0.0", "shared-runtime": "1.0.0" },
  }
  await Bun.write(join(root, "package.json"), JSON.stringify(rootPackage))
  await Bun.write(
    join(app, "record.mjs"),
    'import { appendFileSync } from "node:fs"; appendFileSync("installs.txt", JSON.stringify(process.argv.slice(2)) + "\\n")'
  )
  const config = resolveHullaConfig(
    {
      cli: {
        scripts: {
          add: "bun record.mjs runtime",
          addDev: "bun record.mjs dev",
          uninstall: "true",
          upgrade: "true",
        },
      },
    },
    join(app, ".hulla/hulla.json")
  )
  // Both installation paths should classify the same registry metadata.
  const component = join(root, "component/package.json")
  await Bun.write(
    component,
    JSON.stringify({
      dependencies: { "shared-runtime": "1.0.0" },
      devDependencies: { "custom-checker": "^2.0.0" },
    })
  )
  const { applyCliRuntime } = await import("@/app/runtime")
  const restore = applyCliRuntime({ nonInteractive: true })
  try {
    await createUiDepsTask({
      config,
      projectRoot: app,
      dependencies: ["shared-runtime@1.0.0"],
      devDependencies: ["custom-checker@^2.0.0"],
    })
    await installComponentDependencies({
      config,
      projectRoot: app,
      componentPackageJsonPaths: [component],
    })
  } finally {
    restore()
  }
  expect(
    (await Bun.file(join(app, "installs.txt")).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
  ).toEqual([
    ["runtime", "shared-runtime@1.0.0"],
    ["runtime", "shared-runtime@1.0.0"],
  ])
  expect(await Bun.file(join(root, "package.json")).json()).toEqual(rootPackage)
  await expect(
    classifyWorkspaceDevDependencies({
      projectRoot: app,
      dependencies: [["custom-checker", "^3.0.0"]],
    })
  ).rejects.toThrow("Cannot reuse workspace dev dependency")
  // An enclosing package that does not declare this app as a workspace cannot supply its tools.
  await Bun.write(
    join(root, "package.json"),
    JSON.stringify({ ...rootPackage, workspaces: ["other/*"] })
  )
  expect(
    (
      await classifyWorkspaceDevDependencies({
        projectRoot: app,
        dependencies: [["custom-checker", "^2.0.0"]],
      })
    ).toInstall
  ).toEqual(["custom-checker@^2.0.0"])
})
