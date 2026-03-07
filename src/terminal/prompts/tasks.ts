import type { CommonOptions, Task } from "@clack/prompts"
import { tasks as cTasks } from "@clack/prompts"
import { handleCancel } from "./cancel"
import type { ExtendedPrompt } from "./types.prompts"

type TasksPrompt = CommonOptions & ExtendedPrompt

export async function tasks(tasks: Task[], params?: TasksPrompt) {
  return cTasks(tasks, params).then(handleCancel)
}

export type { Task }
