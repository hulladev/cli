import { getCliCwd } from "@/app/runtime"
import { d } from "@/decorators"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { join, relative } from "path"

type CreateUiViteTaskInput = {
  codeRoots: string[]
}

const VITE_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.cts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
]

export async function createUiViteTask({
  codeRoots,
}: CreateUiViteTaskInput): Promise<void> {
  const uniqueRoots = Array.from(new Set(codeRoots)).filter(
    (value) => value.length > 0
  )
  if (uniqueRoots.length === 0) {
    return
  }

  const selectedRoot = uniqueRoots[0]
  if (uniqueRoots.length > 1) {
    log.warn(
      `Multiple code roots were selected (${uniqueRoots.join(", ")}). Using ${d.path(selectedRoot)} for Vite alias updates.`
    )
  }

  const cliCwd = getCliCwd()
  const viteConfigPath = await findViteConfigPath(cliCwd)
  if (!viteConfigPath) {
    return
  }

  const viteConfigFile = Bun.file(viteConfigPath)
  const original = await viteConfigFile.text()
  if (hasAtAlias(original)) {
    return
  }

  const aliasTarget = selectedRoot === "." ? "/" : `/${selectedRoot}`
  const updated = injectViteAlias(original, aliasTarget)
  if (!updated) {
    log.warn(
      `Could not safely update ${d.path(relative(cliCwd, viteConfigPath))}. Add resolve.alias for @ manually.`
    )
    return
  }

  box(updated.preview, `Proposed changes: ${relative(cliCwd, viteConfigPath)}`)

  const shouldApply = await confirm({
    message: "Apply these Vite alias changes?",
    initialValue: true,
  })
  if (!shouldApply) {
    log.warn("Skipped Vite alias updates.")
    return
  }

  await Bun.write(viteConfigPath, updated.content)
  log.info("Vite alias updated successfully.")
}

async function findViteConfigPath(cwd: string): Promise<string | null> {
  for (const fileName of VITE_CONFIG_FILES) {
    const path = join(cwd, fileName)
    if (await Bun.file(path).exists()) {
      return path
    }
  }
  return null
}

function hasAtAlias(content: string): boolean {
  return /alias\s*:\s*(\{[\s\S]*?["']@["']\s*:|\[[\s\S]*?["']@["'])/.test(
    content
  )
}

function injectViteAlias(
  content: string,
  aliasTarget: string
): { content: string; preview: string } | null {
  const resolveMatch = /resolve\s*:\s*\{/.exec(content)
  if (resolveMatch) {
    const insertAt = resolveMatch.index + resolveMatch[0].length
    const snippet = `\n    alias: { "@": "${aliasTarget}" },`
    const next = `${content.slice(0, insertAt)}${snippet}${content.slice(insertAt)}`
    return {
      content: next,
      preview: `+ resolve.alias["@"] = "${aliasTarget}"`,
    }
  }

  const defineConfigMatch = /defineConfig\s*\(\s*\{/.exec(content)
  if (!defineConfigMatch) {
    return null
  }

  const insertAt = defineConfigMatch.index + defineConfigMatch[0].length
  const snippet = `\n  resolve: {\n    alias: { "@": "${aliasTarget}" },\n  },`
  const next = `${content.slice(0, insertAt)}${snippet}${content.slice(insertAt)}`

  return {
    content: next,
    preview: `+ resolve.alias["@"] = "${aliasTarget}"`,
  }
}
