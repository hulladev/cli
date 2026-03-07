import type { TsconfigJson } from "./parse"

function collapseSinglePrimitiveArrays(json: string): string {
  // Keep one-item primitive arrays inline to reduce formatting-only diff noise.
  const singlePrimitiveArray =
    /\[\n\s*("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|true|false|null)\n\s*]/g
  return json.replace(singlePrimitiveArray, "[$1]")
}

export function renderTsconfig(config: TsconfigJson): string {
  const json = JSON.stringify(config, null, 2)
  return `${collapseSinglePrimitiveArrays(json)}\n`
}
