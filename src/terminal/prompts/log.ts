import { getCliRuntime } from "@/app/runtime"

export const log = {
  info(message: string) {
    return getCliRuntime().terminal.log.info(message)
  },
  warn(message: string) {
    return getCliRuntime().terminal.log.warn(message)
  },
  error(message: string) {
    return getCliRuntime().terminal.log.error(message)
  },
  success(message: string) {
    return getCliRuntime().terminal.log.success(message)
  },
}
