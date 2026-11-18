import { applyCliRuntime } from "@/app/runtime"
import { createUiTsconfigTask } from "@/modules/ui/init/services/tsconfig-plan"
import { findExistingInstall } from "@/modules/ui/shared/existing-install"
import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { UIConfigSchema } from "schemas/ui.schema"

test("revision changes retain saved install settings without merging different libraries or directories", () => {
  const saved = UIConfigSchema.parse({
    installs: [
      {
        sourceUrl: "https://github.com/acme/library/tree/main/generated",
        libraryName: "custom-ui",
        componentsRoot: "src/components/ui",
        codeRoot: "src",
        copyFilesRoot: "src/support",
        frameworks: [
          {
            name: "react",
            templatePath: "react",
            outputPath: "src/components/ui",
            tsconfigPath: "tsconfig.app.json",
          },
        ],
      },
    ],
  }).installs[0]!
  const input = {
    installs: [saved],
    source: "https://github.com/acme/library/tree/v2.0.0/generated",
    libraryName: "custom-ui",
    projectRoot: "/project",
  }
  expect(findExistingInstall(input)).toBe(saved)
  for (const source of [
    "https://github.com/acme/another/tree/v2.0.0/generated",
    "https://github.com/acme/library/tree/v2.0.0/other",
    "https://gitlab.com/acme/library/tree/v2.0.0/generated",
  ])
    expect(findExistingInstall({ ...input, source })).toBeUndefined()
  expect(
    findExistingInstall({ ...input, libraryName: "another-ui" })
  ).toBeUndefined()
  expect(() =>
    findExistingInstall({
      ...input,
      installs: [
        saved,
        {
          ...saved,
          sourceUrl: "https://github.com/acme/library/tree/old/generated",
        },
      ],
    })
  ).toThrow("Multiple saved installs")
})

test("reinitialization uses the saved tsconfig and fails rather than switching when it disappears", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-saved-tsconfig-"))
  const restore = applyCliRuntime({ cwd: root, nonInteractive: true })
  try {
    await Bun.write(join(root, "tsconfig.app.json"), "{}")
    await Bun.write(join(root, "configs/mobile.json"), "{}")
    await Bun.write(join(root, "template.json"), "{}")
    const selectedFrameworks = [
      {
        id: "native",
        sourceUrl: "./registry",
        libraryName: "ui",
        name: "react-native",
        codeRoot: "src",
        templatePath: "native",
        templateTsconfigPath: join(root, "template.json"),
        savedTsconfigPath: "configs/mobile.json",
        outputPath: "src/components/ui",
        copyFileDestinations: [],
        globalStyleDestinations: [],
      },
    ]
    const result = await createUiTsconfigTask({ selectedFrameworks })
    expect(result.frameworkPaths.native).toBe(join(root, "configs/mobile.json"))
    expect(await Bun.file(join(root, "tsconfig.app.json")).text()).toBe("{}")
    const alias = (await Bun.file(join(root, "configs/mobile.json")).json())
      .compilerOptions.paths["@/*"][0]
    expect(resolve(dirname(result.frameworkPaths.native!), alias)).toBe(
      join(root, "src/*")
    )
    await rm(join(root, "configs/mobile.json"))
    await expect(createUiTsconfigTask({ selectedFrameworks })).rejects.toThrow(
      "Saved UI tsconfig not found"
    )
  } finally {
    restore()
    await rm(root, { recursive: true, force: true })
  }
})
