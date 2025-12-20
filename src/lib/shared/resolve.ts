import { d } from "@/decorators"
import { log } from "@/prompts/log"
import { outro } from "@/prompts/outro"
import type { HandlerOutput, ParserResult } from "@/types.private"

export function resolve({
  args,
  commands,
}: {
  args: Map<string, HandlerOutput<"arguments", keyof ParserResult["arguments"]>>
  commands: Map<
    string,
    HandlerOutput<"commands", keyof ParserResult["commands"]>
  >
}) {
  const commandValues = Array.from(commands.values())
  const argValues = Array.from(args.values())

  const handler = <
    On extends "arguments" | "commands",
    K extends keyof ParserResult[On],
  >(
    value: HandlerOutput<On, K>,
    on: On,
    index: number
  ) => {
    const max = on === "arguments" ? argValues.length : commandValues.length
    if (value.isErr()) {
      throw new Error(value.error.message)
    }
    if (index === max - 1) {
      outro(`${d.package("success")} ${value.value.message}`)
    } else {
      log.success(value.value.message)
    }
  }

  argValues.forEach((value, index) => handler(value, "arguments", index))
  commandValues.forEach((value, index) => handler(value, "commands", index))
}
