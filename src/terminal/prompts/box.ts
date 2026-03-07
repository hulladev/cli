import { getCliRuntime } from "@/app/runtime"

export function box(message: string, title?: string) {
  getCliRuntime().terminal.box(message, title)
}
