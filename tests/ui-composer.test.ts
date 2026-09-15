import { runCli } from "@/app/entrypoint"
import { applyCliRuntime } from "@/app/runtime"
import {
  composerModule,
  promptUIComposer,
  rewriteComposerModule,
  withComposerDependencies,
} from "@/modules/ui/init/services/composer"
import { createUiCopyTask } from "@/modules/ui/init/services/copy-files"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  createScriptedPromptAdapter,
  createTerminalCollector,
} from "./cli-test-utils"
import { createTempDir, removeTempDir } from "./helpers"

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(removeTempDir))
})

describe("UI composer selection", () => {
  test("offers an interactive tailwind-merge choice and defaults unattended installs to cn", async () => {
    const restore = applyCliRuntime({
      nonInteractive: false,
      prompts: createScriptedPromptAdapter([
        { kind: "select", value: "tailwind-merge" },
      ]),
    })
    try {
      expect(await promptUIComposer()).toBe("tailwind-merge")
    } finally {
      restore()
    }
    const restoreDefaults = applyCliRuntime({ nonInteractive: true })
    try {
      expect(await promptUIComposer()).toBe("cn")
      expect(await promptUIComposer("tailwind-merge")).toBe("tailwind-merge")
    } finally {
      restoreDefaults()
    }
  })

  test("retains unrelated dependencies and does not rewrite third-party library dependencies", () => {
    const dependencies = {
      "@hulla/style": "0.4.0",
      "tailwind-merge": "^3.6.0",
      react: "^19",
    }
    expect(withComposerDependencies(dependencies, "cn")).toEqual({
      "@hulla/style": "0.4.0",
      cn: "0.3.0",
      react: "^19",
    })
    expect(
      withComposerDependencies(
        { ...dependencies, cn: "0.3.0" },
        "tailwind-merge"
      )
    ).toEqual(dependencies)
    expect(withComposerDependencies(dependencies)).toBe(dependencies)
  })

  test("rewrites the recognized shared helper in either direction and rejects unknown templates", () => {
    expect(rewriteComposerModule(composerModule("tailwind-merge"), "cn")).toBe(
      composerModule("cn")
    )
    expect(
      rewriteComposerModule(
        composerModule("cn").replaceAll('"', "'"),
        "tailwind-merge"
      )
    ).toBe(composerModule("tailwind-merge"))
    expect(() =>
      rewriteComposerModule("export const cn = customComposer", "cn")
    ).toThrow("Unsupported")
  })

  test.each([undefined, "cn", "tailwind-merge"] as const)(
    "persists %s and copies the matching helper through real ui init",
    async (saved) => {
      const dir = await createTempDir("hulla-composer")
      tempDirs.push(dir)
      const registry = join(dir, "registry")
      await mkdir(join(registry, "react", "lib"), { recursive: true })
      await mkdir(join(dir, ".hulla"), { recursive: true })
      await writeFile(
        join(registry, "ui.config.ts"),
        'export const config = { name: "@hulla/ui", version: "1.0.0", frameworks: { react: "react" }, copyFiles: { shared: [{ src: "lib/style.ts", required: true }] } }'
      )
      await writeFile(
        join(registry, "react", "package.json"),
        JSON.stringify({
          dependencies: { "@hulla/style": "0.4.0", cn: "0.3.0" },
        })
      )
      await writeFile(
        join(registry, "react", "tsconfig.json"),
        JSON.stringify({ compilerOptions: { jsx: "react-jsx" } })
      )
      await writeFile(
        join(registry, "react", "lib", "style.ts"),
        composerModule("cn")
      )
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "test-composer",
          packageManager: "bun@1.3.9",
          dependencies: { react: "^19" },
        })
      )
      await writeFile(
        join(dir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      )
      await writeFile(join(dir, "vite.config.ts"), "export default {}")
      await writeFile(
        join(dir, ".hulla", "hulla.json"),
        JSON.stringify({
          cli: {
            scripts: {
              add: "/usr/bin/true",
              addDev: "/usr/bin/true",
              uninstall: "/usr/bin/true",
              upgrade: "/usr/bin/true",
            },
          },
          configs: { ui: ".hulla/ui.json" },
        })
      )
      await writeFile(
        join(dir, ".hulla", "ui.json"),
        JSON.stringify({
          sources: [registry],
          installs: saved
            ? [
                {
                  sourceUrl: registry,
                  libraryName: "@hulla/ui",
                  composer: saved,
                  codeRoot: "src",
                  componentsRoot: "src/components",
                  copyFilesRoot: "src",
                  frameworks: [],
                },
              ]
            : [],
          postAddUpdateStep: "",
        })
      )

      const selected = saved ?? "cn"
      for (let pass = 0; pass < 2; pass++) {
        const collector = createTerminalCollector()
        const result = await runCli({
          argv: ["bun", "hulla", "ui", "init", "--yes"],
          runtime: { cwd: dir, terminal: collector.terminal },
        })
        expect(result.exitCode).toBe(0)
        const config = JSON.parse(
          await readFile(join(dir, ".hulla", "ui.json"), "utf8")
        )
        expect(config.installs[0].composer).toBe(selected)
        expect(
          await readFile(join(dir, "src", "lib", "style.ts"), "utf8")
        ).toBe(composerModule(selected))
        expect(collector.output()).toContain(
          selected === "cn" ? "cn@0.3.0" : "tailwind-merge@^3.6.0"
        )
        expect(collector.output()).not.toContain(
          selected === "cn" ? "tailwind-merge@" : "cn@0.3.0"
        )
      }
    }
  )
})

test("declining a helper overwrite cannot silently save a different composer", async () => {
  const dir = await createTempDir("hulla-composer-keep")
  tempDirs.push(dir)
  await mkdir(join(dir, "registry/react/lib"), { recursive: true })
  await mkdir(join(dir, "src/lib"), { recursive: true })
  await writeFile(
    join(dir, "registry/react/lib/style.ts"),
    composerModule("cn")
  )
  const destination = join(dir, "src/lib/style.ts")
  await writeFile(destination, composerModule("tailwind-merge"))
  const collector = createTerminalCollector()
  const restore = applyCliRuntime({
    nonInteractive: false,
    terminal: collector.terminal,
    prompts: createScriptedPromptAdapter([{ kind: "confirm", value: false }]),
  })
  try {
    await expect(
      createUiCopyTask({
        config: { path: join(dir, ".hulla/hulla.json") } as Parameters<
          typeof createUiCopyTask
        >[0]["config"],
        copyContexts: [
          {
            sourceUrl: "registry",
            libraryName: "@hulla/ui",
            composer: "cn",
            rootDir: join(dir, "registry"),
            codeRoot: "src",
            componentsRoot: "src/components",
            copyFilesRoot: "src",
            sharedCopyEntries: [{ src: "lib/style.ts", required: true }],
            frameworks: [
              {
                id: "react",
                name: "react",
                templatePath: "react",
                outputPath: "src/components",
                copyEntries: [],
              },
            ],
          },
        ],
      })
    ).rejects.toThrow("Cannot select cn while keeping")
    expect(await readFile(destination, "utf8")).toBe(
      composerModule("tailwind-merge")
    )
  } finally {
    restore()
  }
})
