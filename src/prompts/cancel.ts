import { isCancel, cancel } from "@clack/prompts"

export function defaultCancel<T extends Parameters<typeof isCancel>[0]>(
  params: T
) {
  if (isCancel(params)) {
    cancel("Operation cancelled")
    return process.exit(1)
  }

  return params
}

export function handleCancel<T>(result: T | symbol, handler?: VoidFunction) {
  if (isCancel(result)) {
    if (handler) {
      handler()
    } else {
      cancel("Operation cancelled")
    }
    return process.exit(1)
  }

  return result
}
