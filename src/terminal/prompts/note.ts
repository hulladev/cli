import { getCliRuntime } from "@/app/runtime"

export function note(message: string, title?: string) {
  return getCliRuntime().terminal.note(message, title)
}
