import { getCliRuntime } from "@/app/runtime"

export function outro(message: string) {
  getCliRuntime().terminal.outro(message)
}
