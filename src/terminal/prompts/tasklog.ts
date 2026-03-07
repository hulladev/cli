import type { TaskLogOptions } from "@clack/prompts"
import { taskLog as cTask } from "@clack/prompts"

type TaskPrompt = TaskLogOptions

export async function taskLog(params: TaskPrompt) {
  return cTask(params)
}
