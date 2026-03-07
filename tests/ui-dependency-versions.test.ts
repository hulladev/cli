import {
  classifyDependencySpecs,
  extractDependencyName,
} from "@/modules/ui/shared/dependency-versions"
import { describe, expect, test } from "bun:test"

describe("ui dependency version classification", () => {
  test("marks older installed versions for update", () => {
    const result = classifyDependencySpecs({
      dependencies: [["@hulla/style", "^0.2.10"]],
      projectPackageJson: {
        name: "sandbox",
        dependencies: {
          "@hulla/style": "^0.2.2",
        },
      },
    })

    expect(result.toInstall).toEqual([])
    expect(result.toUpdate).toEqual([
      {
        name: "@hulla/style",
        installed: "^0.2.2",
        required: "^0.2.10",
        spec: "@hulla/style@^0.2.10",
      },
    ])
    expect(result.satisfied).toEqual([])
  })

  test("keeps newer installed versions satisfied", () => {
    const result = classifyDependencySpecs({
      dependencies: [["@hulla/style", "^0.2.10"]],
      projectPackageJson: {
        name: "sandbox",
        dependencies: {
          "@hulla/style": "^0.3.0",
        },
      },
    })

    expect(result.toUpdate).toEqual([])
    expect(result.satisfied).toEqual([
      {
        name: "@hulla/style",
        installed: "^0.3.0",
        required: "^0.2.10",
      },
    ])
  })

  test("extracts scoped package names from dependency specs", () => {
    expect(extractDependencyName("@hulla/style@^0.2.10")).toBe("@hulla/style")
    expect(extractDependencyName("react@19.1.0")).toBe("react")
    expect(extractDependencyName("tailwindcss")).toBe("tailwindcss")
  })
})
