import { runCli } from "@/app/entrypoint"
import { afterEach, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createTerminalCollector } from "./cli-test-utils"
import { createTempDir, removeTempDir } from "./helpers"

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDir))
})

test.each(["expo", "react-native"])(
  "%s ui init selects native, skips web setup, and preserves host TypeScript settings",
  async (host) => {
    const dir = await createTempDir("ui-init-native")
    dirs.push(dir)
    const registry = join(dir, "registry")
    await mkdir(join(registry, "react"), { recursive: true })
    await mkdir(join(registry, "react-native/lib"), { recursive: true })
    await mkdir(join(dir, ".hulla"), { recursive: true })
    await writeFile(
      join(registry, "ui.config.ts"),
      `export const config = {
      name: "@hulla/ui", version: "1.0.0",
      frameworks: { react: "react", "react-native": "react-native" },
      copyFiles: { "react-native": [{ src: "lib/style.ts", required: true }] }
    }`
    )
    await writeFile(
      join(registry, "react/package.json"),
      JSON.stringify({
        dependencies: { cn: "0.3.0", "@tailwindcss/vite": "*" },
      })
    )
    await writeFile(join(registry, "react/tsconfig.json"), "{}")
    await writeFile(
      join(registry, "react-native/package.json"),
      JSON.stringify({
        dependencies: { "@hulla/style-native": "*" },
      })
    )
    await writeFile(
      join(registry, "react-native/tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          types: ["react"],
          lib: ["DOM"],
          strict: true,
        },
        exclude: ["node_modules"],
        include: ["**/*"],
      })
    )
    const nativeStyle =
      'import { style } from "@hulla/style"\nimport { native } from "@hulla/style-native"\nexport const { cn, vn } = style(native)\n'
    await writeFile(join(registry, "react-native/lib/style.ts"), nativeStyle)
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "mobile",
        packageManager: "bun@1.3.9",
        dependencies: { react: "^19", [host]: "*" },
      })
    )
    const hostTsconfig = {
      ...(host === "expo" ? { extends: "expo/tsconfig.base" } : {}),
      compilerOptions: {
        jsx: "react-native",
        types: ["custom-native"],
        strict: false,
        paths: { "@assets/*": ["./assets/*"] },
      },
      include: [
        ...(host === "expo"
          ? ["**/*.ts", "**/*.tsx"]
          : ["src/**/*.ts", "src/**/*.tsx"]),
        ".expo/types/**/*.ts",
        "expo-env.d.ts",
      ],
      exclude: ["fixtures"],
    }
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify(hostTsconfig, null, 2)
    )
    const viteConfig = "export default { plugins: [] }\n"
    await writeFile(join(dir, "vite.config.ts"), viteConfig)
    await writeFile(
      join(dir, ".hulla/hulla.json"),
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
      join(dir, ".hulla/ui.json"),
      JSON.stringify({
        sources: [registry],
        installs: [],
        postAddUpdateStep: "",
      })
    )

    for (let pass = 0; pass < 2; pass++) {
      const expectedConfig = {
        ...hostTsconfig,
        compilerOptions: {
          ...hostTsconfig.compilerOptions,
          paths: {
            ...hostTsconfig.compilerOptions.paths,
            "@/*": [pass === 0 ? "./src/*" : "./*"],
          },
        },
      }
      // On reinitialization, an intentional root alias and comments must survive unchanged.
      const existingText = `// Keep the app's alias and comments\n${JSON.stringify(expectedConfig, null, 2)}\n`
      if (pass === 1) await writeFile(join(dir, "tsconfig.json"), existingText)
      const collector = createTerminalCollector()
      const result = await runCli({
        argv: ["bun", "hulla", "ui", "init", "--yes"],
        runtime: { cwd: dir, terminal: collector.terminal },
      })
      expect(result.exitCode).toBe(0)
      const config = JSON.parse(
        await readFile(join(dir, ".hulla/ui.json"), "utf8")
      )
      expect(
        config.installs[0].frameworks.map((item: { name: string }) => item.name)
      ).toEqual(["react-native"])
      expect(config.installs[0].composer).toBeUndefined()
      const tsconfigText = await readFile(join(dir, "tsconfig.json"), "utf8")
      if (pass === 0) expect(JSON.parse(tsconfigText)).toEqual(expectedConfig)
      else expect(tsconfigText).toBe(existingText)
      expect(await readFile(join(dir, "src/lib/style.ts"), "utf8")).toBe(
        nativeStyle
      )
      expect(await readFile(join(dir, "vite.config.ts"), "utf8")).toBe(
        viteConfig
      )
      expect(collector.output()).not.toMatch(
        /cn@|tailwind-merge|tailwindcss|Vite config/
      )
    }
  }
)
