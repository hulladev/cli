import type { PromptAdapter, TerminalAdapter } from "@/app/runtime"

type PromptKind =
  | "confirm"
  | "select"
  | "text"
  | "path"
  | "multiselect"
  | "autocompleteMultiselect"

export type ScriptedPromptAnswer = {
  kind: PromptKind
  value: unknown
}

export type TerminalEvent = {
  type:
    | "intro"
    | "outro"
    | "note"
    | "box"
    | "cancel"
    | "info"
    | "warn"
    | "error"
    | "success"
    | "spinner:start"
    | "spinner:stop"
  message: string
  title?: string
}

export function createScriptedPromptAdapter(
  answers: ScriptedPromptAnswer[]
): PromptAdapter {
  const queue = [...answers]

  function next(kind: PromptKind): unknown {
    const answer = queue.shift()
    if (!answer) {
      throw new Error(`Unexpected ${kind} prompt with no scripted answer left`)
    }
    if (answer.kind !== kind) {
      throw new Error(
        `Expected scripted ${answer.kind} answer, but received ${kind} prompt`
      )
    }
    return answer.value
  }

  return {
    async confirm() {
      return Boolean(next("confirm"))
    },
    async select<T>() {
      return next("select") as T
    },
    async text() {
      return String(next("text"))
    },
    async path() {
      return String(next("path"))
    },
    async multiselect<T>() {
      return next("multiselect") as T[]
    },
    async autocompleteMultiselect<T>() {
      return next("autocompleteMultiselect") as T[]
    },
  }
}

export function createTerminalCollector(): {
  terminal: TerminalAdapter
  events: TerminalEvent[]
  output(): string
} {
  const events: TerminalEvent[] = []

  const terminal: TerminalAdapter = {
    intro(message) {
      events.push({ type: "intro", message })
    },
    outro(message) {
      events.push({ type: "outro", message })
    },
    note(message, title) {
      events.push({ type: "note", message, title })
    },
    box(message, title) {
      events.push({ type: "box", message, title })
    },
    cancel(message) {
      events.push({ type: "cancel", message })
    },
    log: {
      info(message) {
        events.push({ type: "info", message })
      },
      warn(message) {
        events.push({ type: "warn", message })
      },
      error(message) {
        events.push({ type: "error", message })
      },
      success(message) {
        events.push({ type: "success", message })
      },
    },
    spinner() {
      return {
        start(message: string) {
          events.push({ type: "spinner:start", message })
        },
        stop(message = "") {
          events.push({ type: "spinner:stop", message })
        },
      }
    },
  }

  return {
    terminal,
    events,
    output() {
      return events
        .map((event) =>
          event.title
            ? `${event.type}:${stripAnsi(event.title)}:${stripAnsi(event.message)}`
            : `${event.type}:${stripAnsi(event.message)}`
        )
        .join("\n")
    },
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "")
}
