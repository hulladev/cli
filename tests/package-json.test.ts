import {
  detectPackageManager,
  getPackageJson,
  getPackageManagerFromLockfile,
} from "@/platform/package-json"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createTempDir, removeTempDir } from "./helpers"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDir))
})

describe("package-json helpers", () => {
  test("detects package manager from lockfile", async () => {
    const dir = await createTempDir("pkg-lock")
    dirs.push(dir)

    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n")

    await expect(getPackageManagerFromLockfile(dir)).resolves.toBe("pnpm")
  })

  test("reads package.json from a project directory", async () => {
    const dir = await createTempDir("pkg-json")
    dirs.push(dir)

    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2)
    )

    await expect(getPackageJson(dir, "package.json")).resolves.toMatchObject({
      name: "demo",
      version: "1.0.0",
    })
  })

  test.each([
    {
      name: "Bun lockfiles and object workspaces",
      manager: "bun",
      files: {
        "package.json": JSON.stringify({
          name: "workspace",
          workspaces: { packages: ["apps/*"] },
        }),
        "bun.lock": "{}",
        "bun.lockb": "legacy lockfile",
      },
    },
    {
      name: "pnpm workspace YAML",
      manager: "pnpm",
      files: {
        "package.json": JSON.stringify({ name: "workspace" }),
        "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      },
    },
  ])(
    "inherits $name from the containing workspace",
    async ({ manager, files }) => {
      const root = await createTempDir("pkg-workspace")
      dirs.push(root)
      const app = join(root, "apps/mobile")
      await mkdir(app, { recursive: true })
      await writeFile(
        join(app, "package.json"),
        JSON.stringify({ name: "mobile" })
      )
      for (const [path, content] of Object.entries(files)) {
        await writeFile(join(root, path), content)
      }

      expect((await detectPackageManager(app))?.manager).toBe(manager)
    }
  )

  test("honors an explicit app manager over the containing workspace", async () => {
    const root = await createTempDir("pkg-override")
    dirs.push(root)
    const app = join(root, "apps/mobile")
    await mkdir(app, { recursive: true })
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "workspace",
        workspaces: ["apps/*"],
        packageManager: "bun@1.4.0",
      })
    )
    await writeFile(
      join(app, "package.json"),
      JSON.stringify({
        name: "mobile",
        packageManager: "yarn@4.0.0",
      })
    )

    expect((await detectPackageManager(app))?.manager).toBe("yarn")
  })

  test.each([
    "unrelated parent",
    "excluded workspace",
    "nested Git repository",
  ])(
    "does not inherit a manager across this boundary: %s",
    async (boundary) => {
      const root = await createTempDir("pkg-boundary")
      dirs.push(root)
      const app = join(root, "apps/mobile")
      await mkdir(app, { recursive: true })
      await writeFile(
        join(app, "package.json"),
        JSON.stringify({ name: "mobile" })
      )
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          name: "parent",
          packageManager: "bun@1.4.0",
          workspaces:
            boundary === "unrelated parent"
              ? undefined
              : boundary === "excluded workspace"
                ? ["apps/*", "!apps/mobile"]
                : ["apps/*"],
        })
      )
      if (boundary === "nested Git repository") {
        await writeFile(join(app, ".git"), "gitdir: /some/other/repository\n")
      }

      expect(await detectPackageManager(app)).toBeNull()
    }
  )

  test("rejects conflicting lockfiles instead of using array order to select npm", async () => {
    const dir = await createTempDir("pkg-conflict")
    dirs.push(dir)
    await writeFile(join(dir, "package-lock.json"), "{}")
    await writeFile(join(dir, "bun.lock"), "{}")

    await expect(detectPackageManager(dir)).rejects.toThrow(
      "Conflicting package manager lockfiles"
    )
  })
})
