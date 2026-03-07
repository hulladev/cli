import { getCliRuntime, requestCliExit } from "@/app/runtime"
import { isCancel } from "@clack/prompts"

export function defaultCancel<T extends Parameters<typeof isCancel>[0]>(
  params: T
) {
  if (isCancel(params)) {
    getCliRuntime().terminal.cancel("Operation cancelled")
    return requestCliExit(1)
  }

  return params
}

export function handleCancel<T>(result: T | symbol, handler?: () => void) {
  if (isCancel(result)) {
    if (handler) {
      handler()
    } else {
      getCliRuntime().terminal.cancel("Operation cancelled")
    }
    return requestCliExit(1)
  }

  return result
}
