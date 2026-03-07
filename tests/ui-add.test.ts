import { findMatchesForComponent } from "@/modules/ui/add/services/selection"
import { hasMatchingContent } from "@/modules/ui/add/services/workflow"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, test } from "bun:test"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("ui add selection", () => {
  test("filters matches by framework when specified", () => {
    const matches = findMatchesForComponent({
      componentInput: "button",
      explicitFramework: "react",
      frameworkInstalls: [
        {
          sourceUrl: "repo-a",
          libraryName: "ui-lib",
          frameworkName: "react",
          templatePath: "react",
          outputPath: "src/components",
          codeRoot: "src",
          copyFilesRoot: "src",
          sourceRoot: "/tmp/ui-lib",
          sourceFrameworkRoot: "/tmp/ui-lib/react",
          componentsByLowerName: new Map([["button", "Button"]]),
        },
        {
          sourceUrl: "repo-a",
          libraryName: "ui-lib",
          frameworkName: "vue",
          templatePath: "vue",
          outputPath: "src/components",
          codeRoot: "src",
          copyFilesRoot: "src",
          sourceRoot: "/tmp/ui-lib",
          sourceFrameworkRoot: "/tmp/ui-lib/vue",
          componentsByLowerName: new Map([["button", "Button"]]),
        },
      ],
    })

    expect(matches).toHaveLength(1)
    expect(matches[0]?.frameworkName).toBe("react")
  })

  test("detects unchanged existing text content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hulla-ui-add-"))
    tempDirs.push(dir)

    const filePath = join(dir, "index.tsx")
    await writeFile(filePath, 'export * from "./button"\n')

    const matches = await hasMatchingContent(
      Bun.file(filePath),
      'export * from "./button"\n'
    )

    expect(matches).toBe(true)
  })
})
