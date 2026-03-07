import { getCliRuntime } from "@/app/runtime"

export function spinner() {
  return getCliRuntime().terminal.spinner()
}
