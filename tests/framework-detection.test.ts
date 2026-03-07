import { detectFrameworkDetailed } from "@/platform/framework-detection"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createTempDir, removeTempDir } from "./helpers"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDir))
})

describe("framework detection", () => {
  test("discovers frameworks inside workspaces", async () => {
    const dir = await createTempDir("frameworks")
    dirs.push(dir)

    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "root",
          workspaces: ["packages/*"],
        },
        null,
        2
      )
    )

    const appDir = join(dir, "packages", "web")
    await mkdir(appDir, { recursive: true })
    await writeFile(
      join(appDir, "package.json"),
      JSON.stringify(
        {
          name: "web",
          dependencies: {
            react: "^19.0.0",
          },
        },
        null,
        2
      )
    )

    const result = await detectFrameworkDetailed(dir)

    expect(result.detections.some((item) => item.framework === "react")).toBe(
      true
    )
    expect(
      Array.from(result.packageJsons.keys()).length
    ).toBeGreaterThanOrEqual(2)
  })
})
