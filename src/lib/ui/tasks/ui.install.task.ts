import type { Task } from "@/prompts/tasks"
import type { HullaConfig } from "@/types"
import gittar from "@hulla/gittar"
import { defaultUiConfig } from "schemas/hulla.schema"

export function createUiInstallTask(config: HullaConfig): Task {
  return {
    title: "Installing necessary dependencies",
    task: async () => {
      const libUrls = config.ui?.libs ?? defaultUiConfig.libs

      const libs = await Promise.all(
        libUrls.map(async (url) => {
          const lib = await gittar({ url, update: "commit" })
          return lib
        })
      )

      console.log("xx--->", libs)

      const { add } = config.cli.scripts
      const [command, ...args] = add.split(" ")
      // const proc = Bun.spawn([command, ...args, "@hulla/style"], {
      //   stdout: "inherit",
      //   stderr: "inherit",
      // })
      // await proc.exited
      // if (proc.exitCode !== 0) {
      //   throw new Error(
      //     `Failed to install @hulla/style (exit code: ${proc.exitCode})`
      //   )
      // }
    },
  }
}
