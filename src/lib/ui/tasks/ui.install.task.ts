import { getCacheDir } from "@/lib/cache"
import type { Task } from "@/prompts/tasks"
import type { HullaConfig, UIInitTaskState } from "@/types"

export function createUiInstallTask(
  config: HullaConfig,
  state: UIInitTaskState
): Task {
  return {
    title: "Installing necessary dependencies",
    task: async () => {
      const cacheDir = getCacheDir(config, "ui")

      const { add } = config.cli.scripts
      const [command, ...args] = add.split(" ")
      const proc = Bun.spawn([command, ...args, "@hulla/style"], {
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited
      if (proc.exitCode !== 0) {
        throw new Error(
          `Failed to install @hulla/style (exit code: ${proc.exitCode})`
        )
      }
    },
  }
}
