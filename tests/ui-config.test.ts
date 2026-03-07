import {
  getProjectRootFromConfigPath,
  normalizeProjectRelativePath,
  resolveUIConfigPath,
} from "@/modules/ui/config"
import { describe, expect, test } from "bun:test"

describe("ui config paths", () => {
  test("normalizes project-relative paths", () => {
    expect(normalizeProjectRelativePath("./src/components/")).toBe(
      "src/components"
    )
    expect(normalizeProjectRelativePath("")).toBe(".")
  })

  test("derives project root from hulla config path", () => {
    expect(getProjectRootFromConfigPath("/tmp/demo/.hulla/hulla.json")).toBe(
      "/tmp/demo"
    )
  })

  test("resolves ui config path from hulla config", () => {
    const resolved = resolveUIConfigPath({
      path: "/tmp/demo/.hulla/hulla.json",
      rawConfig: {
        cli: {
          scripts: {
            add: "bun add",
            addDev: "bun add -D",
            uninstall: "bun remove",
            upgrade: "bun update",
          },
        },
      },
      cli: {
        scripts: {
          add: "bun add",
          addDev: "bun add -D",
          uninstall: "bun remove",
          upgrade: "bun update",
        },
        cache: true,
        cacheDir: "/tmp/demo/.hulla/.cache",
        logs: true,
      },
      configs: {
        ui: ".hulla/custom-ui.json",
      },
    })

    expect(resolved).toBe("/tmp/demo/.hulla/custom-ui.json")
  })
})
