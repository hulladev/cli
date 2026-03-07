import { intro as cIntro } from "@clack/prompts"

let didIntro = false

export function intro(
  message: string,
  mode: "preventDupes" | "multiple" = "preventDupes"
) {
  if (mode === "preventDupes" && didIntro) return
  didIntro = true
  cIntro(message)
}
