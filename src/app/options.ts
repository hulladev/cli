import type { ParserNode, ParserResult } from "./types"

export function detectedNodes(result: ParserResult): ParserNode[] {
  const nodes: ParserNode[] = [result as unknown as ParserNode]
  let current = result.commands
  while (current) {
    const child = Object.values(current).find((node) => node.detected)
    if (!child) break
    nodes.push(child)
    current = child.commands
  }
  return nodes
}

export function getStringOption(
  result: ParserResult,
  name: string
): string | undefined {
  const matches = detectedNodes(result)
    .map((node) => node.arguments[name])
    .filter((arg) => arg?.detected)
  const values = matches
    .map((arg) => arg.value)
    .filter((value): value is string => typeof value === "string")
  if (new Set(values).size > 1)
    throw new Error(`Conflicting --${name} values. Pass it once.`)
  return values.at(-1)
}
