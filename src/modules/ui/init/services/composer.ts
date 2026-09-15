import { select } from "@/terminal/prompts/select"

export type UIComposer = "cn" | "tailwind-merge"

const versions: Record<UIComposer, string> = {
  cn: "0.3.0",
  "tailwind-merge": "^3.6.0",
}

export async function promptUIComposer(
  initial?: UIComposer
): Promise<UIComposer> {
  return select<UIComposer>({
    message: "Choose a class composer for @hulla/ui",
    initialValue: initial ?? "cn",
    options: [
      {
        label: "cn (recommended)",
        value: "cn",
        hint: "Faster repeated class composition",
      },
      {
        label: "tailwind-merge",
        value: "tailwind-merge",
        hint: "Smaller compressed bundle",
      },
    ],
  })
}

export function withComposerDependencies(
  dependencies: Record<string, string>,
  composer?: UIComposer
): Record<string, string> {
  if (!composer) return dependencies
  const result = { ...dependencies }
  delete result.cn
  delete result["tailwind-merge"]
  result[composer] = dependencies[composer] ?? versions[composer]
  return result
}

export function composerModule(composer: UIComposer): string {
  const binding = composer === "cn" ? "compose" : "twMerge"
  const imported = composer === "cn" ? "cn as compose" : "twMerge"
  return `import { style } from "@hulla/style"
import { ${imported} } from "${composer}"

export const { vn, cn } = style({ composer: ${binding} })
`
}

export function matchesComposerModule(
  source: string,
  composer: UIComposer
): boolean {
  const normalize = (value: string) =>
    value.replace(/[\s;]/g, "").replace(/'/g, '"')
  return normalize(source) === normalize(composerModule(composer))
}

export function rewriteComposerModule(
  source: string,
  composer: UIComposer
): string {
  const known = Object.keys(versions).some((name) =>
    matchesComposerModule(source, name as UIComposer)
  )
  if (!known) {
    throw new Error(
      "Unsupported @hulla/ui lib/style.ts template; cannot safely apply the selected composer."
    )
  }
  return composerModule(composer)
}
