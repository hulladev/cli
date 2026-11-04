import { initHullaProject } from "@/modules/init"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import { writeConfig } from "@/platform/config/write-hulla-config"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { ConfigSchema } from "schemas/hulla.schema"
import { z } from "zod"
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
    expect(config?.configs.api).toBe("api.config.ts")
    expect(config?.cli.cacheDir).toBe(join(dir, ".hulla", ".cache"))

    const savedConfig = await Bun.file(filePath).json()
    expect(savedConfig.cli).not.toHaveProperty("cacheDir")

    const otherDir = await createTempDir("hulla-config-worktree")
    dirs.push(otherDir)
    await mkdir(join(otherDir, ".hulla"), { recursive: true })
    await writeFile(
      join(otherDir, ".hulla", "hulla.json"),
      await readFile(filePath)
    )
    const relocatedConfig = await readHullaConfig(otherDir)
    expect(relocatedConfig?.cli.cacheDir).toBe(
      join(otherDir, ".hulla", ".cache")
    )
  })

  test.each([
    [".hulla/custom.json", "."],
    ["settings/custom.json", "settings"],
  ])(
    "resolves and preserves relative cache paths for %s from another cwd",
    async (configPath, expectedRoot) => {
      const dir = await createTempDir("hulla-custom-cache")
      dirs.push(dir)
      const filePath = join(dir, configPath)
      await mkdir(dirname(filePath), { recursive: true })
      const rawConfig = {
        cli: {
          scripts: {
            add: "bun add",
            addDev: "bun add -D",
            uninstall: "bun remove",
            upgrade: "bun update",
          },
          cacheDir: "build/cache",
        },
      }
      await Bun.write(filePath, JSON.stringify(rawConfig))

      const config = await readHullaConfig(process.cwd(), filePath)
      const root = join(dir, expectedRoot)
      expect(config?.cli.cacheDir).toBe(join(root, "build", "cache"))
      expect(config).not.toBeNull()
      await writeConfig(config!, filePath)
      expect((await Bun.file(filePath).json()).cli.cacheDir).toBe("build/cache")

      // An explicit runtime override must take precedence over the saved value.
      config!.cli.cacheDir = join(dir, "shared-cache")
      await writeConfig(config!, filePath)
      const reloaded = await readHullaConfig(process.cwd(), filePath)
      expect(reloaded?.cli.cacheDir).toBe(join(dir, "shared-cache"))
      expect((await Bun.file(filePath).json()).cli.cacheDir).toBe(
        join(dir, "shared-cache")
      )
    }
  )

  test("exports a portable cache default for editor schemas", () => {
    const schema = z.toJSONSchema(ConfigSchema)
    expect(schema).toHaveProperty(
      "properties.cli.properties.cacheDir.default",
      ".hulla/.cache"
    )
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
      expect(result.value.cli.cacheDir).toBe(join(dir, ".hulla", ".cache"))
    }
  })
})
