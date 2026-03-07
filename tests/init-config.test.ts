import { initHullaProject } from "@/modules/init"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import { writeConfig } from "@/platform/config/write-hulla-config"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createTempDir, removeTempDir } from "./helpers"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDir))
})

describe("hulla config flows", () => {
  test("writes and reads config through platform helpers", async () => {
    const dir = await createTempDir("hulla-config")
    dirs.push(dir)

    await mkdir(join(dir, ".hulla"), { recursive: true })
    const filePath = join(dir, ".hulla", "hulla.json")

    await writeConfig(
      {
        $schema: "https://example.com/schema.json",
        cli: {
          scripts: {
            add: "bun add",
            addDev: "bun add -D",
            uninstall: "bun remove",
            upgrade: "bun update",
          },
          cache: true,
          cacheDir: join(dir, ".hulla", ".cache"),
          logs: true,
        },
        configs: {
          ui: ".hulla/ui.json",
        },
      },
      filePath
    )

    const config = await readHullaConfig(dir)
    expect(config?.path).toBe(filePath)
    expect(config?.cli.scripts.add).toBe("bun add")
  })

  test("loads existing project config in check mode without prompting", async () => {
    const dir = await createTempDir("hulla-existing")
    dirs.push(dir)

    await mkdir(join(dir, ".hulla"), { recursive: true })
    await writeFile(
      join(dir, ".hulla", "hulla.json"),
      JSON.stringify(
        {
          cli: {
            scripts: {
              add: "bun add",
              addDev: "bun add -D",
              uninstall: "bun remove",
              upgrade: "bun update",
            },
          },
          configs: {
            ui: ".hulla/ui.json",
          },
        },
        null,
        2
      )
    )

    const result = await initHullaProject(dir, "check")

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.path).toBe(join(dir, ".hulla", "hulla.json"))
    }
  })
})
