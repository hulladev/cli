import {
  getPackageJson,
  getPackageManagerFromLockfile,
} from "@/platform/package-json"
import { afterEach, describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
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
})
