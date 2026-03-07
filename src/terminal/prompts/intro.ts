import { getCliRuntime } from "@/app/runtime"

let didIntro = false

export function intro(
  message: string,
  mode: "preventDupes" | "multiple" = "preventDupes"
) {
  if (mode === "preventDupes" && didIntro) return
  didIntro = true
  getCliRuntime().terminal.intro(message)
}

export function resetIntroState(): void {
  didIntro = false
}
