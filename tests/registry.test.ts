import { cli } from "@/app/registry"
import { describe, expect, test } from "bun:test"

describe("cli registry", () => {
  test("registers top-level commands", () => {
    const result = cli.parse(["bun", "hulla", "install"]) as unknown as {
      commands: {
        install: { detected: boolean }
        init: { detected: boolean }
        ui: { detected: boolean }
      }
    }

    expect(result.commands.install.detected).toBe(true)
    expect(result.commands.init.detected).toBe(false)
    expect(result.commands.ui.detected).toBe(false)
  })

  test("registers ui subcommands", () => {
    const result = cli.parse([
      "bun",
      "hulla",
      "ui",
      "add",
      "button",
    ]) as unknown as {
      commands: {
        ui: {
          detected: boolean
          commands: {
            add: { detected: boolean }
            remove: { detected: boolean }
          }
        }
      }
    }

    expect(result.commands.ui.detected).toBe(true)
    expect(result.commands.ui.commands.add.detected).toBe(true)
    expect(result.commands.ui.commands.remove.detected).toBe(false)
  })
})
