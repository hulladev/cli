import { err, ok } from "@hulla/control"
import type { CommandOutcome, CommandSuccess } from "./types"

export function commandOk<T>(message: string, data: T): CommandOutcome<T> {
  return ok({
    data,
    message,
  })
}

export function commandOkMessage(message: string): CommandOutcome<null> {
  return commandOk(message, null)
}

export function commandErr(error: Error): CommandOutcome<never> {
  return err(error)
}

export function unwrapOutcome<T>(
  outcome: CommandOutcome<T>
): CommandSuccess<T> {
  if (outcome.isErr()) {
    throw outcome.error
  }

  return outcome.value
}

export function reportOutcome(outcome: CommandOutcome, isLast: boolean): void {
  const result = unwrapOutcome(outcome)
  if (isLast) {
    return
  }
  void result
}
