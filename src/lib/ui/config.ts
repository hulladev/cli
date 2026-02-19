import { readJsonFile, writeJsonFile } from "@/lib/shared/bunUtils"
import type { HullaConfig } from "@/types"
import { dirname, isAbsolute, resolve } from "path"
import {
  UIConfigSchema,
  defaultUISources,
  type UIConfigSchemaType,
} from "schemas/ui.schema"
import type { UIProjectConfigSchema } from "schemas/ui.types"

export const DEFAULT_UI_CONFIG_PATH = ".hulla/ui.json"

export type UIProjectConfig = UIProjectConfigSchema
export type UIProjectSource = UIProjectConfigSchema["sources"][number]
export type UIProjectInstall = UIProjectConfigSchema["installs"][number]

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/")
}

export function normalizeProjectRelativePath(value: string): string {
  const normalized = normalizePath(value).trim()
  const noDotPrefix = normalized.replace(/^\.\//, "")
  const noTrailingSlash = noDotPrefix.replace(/\/+$/, "")
  return noTrailingSlash.length > 0 ? noTrailingSlash : "."
}

export function getProjectRootFromConfigPath(configPath: string): string {
  const normalized = normalizePath(configPath)
  const configDir = dirname(normalized)
  if (configDir.endsWith("/.hulla")) {
    return dirname(configDir)
  }
  return configDir
}

export function resolveUIConfigPath(config: HullaConfig): string {
  const root = getProjectRootFromConfigPath(config.path)
  const configuredPath = config.configs?.ui ?? DEFAULT_UI_CONFIG_PATH
  const normalized = normalizePath(configuredPath)
  if (isAbsolute(normalized)) {
    return normalized
  }
  return normalizePath(resolve(root, normalized))
}

export async function readUIConfig(config: HullaConfig): Promise<{
  path: string
  data: UIProjectConfig
}> {
  const path = resolveUIConfigPath(config)
  const raw = await readJsonFile<unknown>(path)
  if (!raw) {
    return {
      path,
      data: UIConfigSchema.parse({}) as UIProjectConfig,
    }
  }

  const parsed = UIConfigSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Invalid UI config at ${path}: ${parsed.error.message}`)
  }

  return {
    path,
    data: parsed.data as UIProjectConfig,
  }
}

export async function writeUIConfig(
  path: string,
  config: UIProjectConfig
): Promise<void> {
  const parsed = UIConfigSchema.safeParse(config as UIConfigSchemaType)
  if (!parsed.success) {
    throw new Error(`Invalid UI config: ${parsed.error.message}`)
  }
  await writeJsonFile(path, parsed.data, true)
}

export { defaultUISources }
