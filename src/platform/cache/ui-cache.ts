import type { HullaConfig } from "@/types"
import { join } from "path"
import {
  uiCacheSchema,
  type UICache,
  type UICacheItem,
} from "schemas/hulla.schema"

export function getCacheDir(config: HullaConfig, subPath?: "ui") {
  return join(config.cli.cacheDir, subPath ?? "")
}

export type UICacheUpdate = {
  [LibNameAndUrl: string]: UICacheItem
}

export function getUILibCacheKey(name: string, url: string) {
  return `${name} (${url})`
}

export async function readUICache(
  config: HullaConfig
): Promise<UICache | null> {
  const cacheDir = getCacheDir(config)
  const cacheFile = Bun.file(join(cacheDir, "ui.cache.json"))

  if (!(await cacheFile.exists())) {
    return null
  }

  try {
    const data = await cacheFile.json()
    const parsed = uiCacheSchema.safeParse(data)
    if (!parsed.success) {
      console.warn("UI cache is corrupted, ignoring:", parsed.error.message)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export async function writeUICache(config: HullaConfig, cache: UICache) {
  const cacheDir = getCacheDir(config)
  const cacheFile = Bun.file(join(cacheDir, "ui.cache.json"))
  await cacheFile.write(JSON.stringify(cache, null, 2))
}

export async function updateUICache(config: HullaConfig, libs: UICacheUpdate) {
  const existing = await readUICache(config)

  const cache: UICache = {
    lastUpdated: new Date().toISOString(),
    libs: {
      ...(existing?.libs ?? {}),
      ...libs,
    },
  }

  await writeUICache(config, cache)
}
