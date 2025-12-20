/**
 * Bun-specific file utilities with consistent error handling
 * This layer ensures all Bun API calls follow our error patterns
 */

/**
 * Check if multiple files exist in parallel
 * Replaces sequential existsSync() calls
 */
export async function filesExist(
  paths: string[]
): Promise<Map<string, boolean>> {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const file = Bun.file(path)
        const exists = await file.exists()
        return [path, exists] as const
      } catch {
        return [path, false] as const
      }
    })
  )
  return new Map(results)
}

/**
 * Find the first existing file from a list of paths
 * Optimized for config file detection
 */
export async function findFirstExisting(
  paths: string[]
): Promise<string | null> {
  const existsMap = await filesExist(paths)
  for (const path of paths) {
    if (existsMap.get(path)) return path
  }
  return null
}

/**
 * Read and parse JSON file using Bun's native JSON parser
 * Replaces readFile + JSON.parse
 */
export async function readJsonFile<T = unknown>(
  path: string
): Promise<T | null> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return (await file.json()) as T
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw new Error(
      `Failed to read or parse JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Try reading JSON from multiple paths, return first success
 * Optimized for finding config files
 */
export async function readJsonFromPaths<T = unknown>(
  paths: string[]
): Promise<{ data: T; path: string } | null> {
  const errors: string[] = []

  // Read all files in parallel
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const data = await readJsonFile<T>(path)
      if (data === null) throw new Error(`File not found: ${path}`)
      return { data, path }
    })
  )

  // Return first successful read (maintains priority order)
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === "fulfilled") {
      return result.value
    } else if (result.reason && !isNotFoundError(result.reason)) {
      errors.push(
        `Failed to parse ${paths[i]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
      )
    }
  }

  // If we found files but couldn't parse any, throw
  if (errors.length > 0) {
    throw new Error(
      `Found config files but failed to parse them:\n${errors.join("\n")}`
    )
  }

  return null
}

/**
 * Write JSON file atomically with directory creation
 * Replaces mkdir + writeFile
 */
export async function writeJsonFile(
  path: string,
  data: unknown,
  pretty = true
): Promise<void> {
  try {
    const content = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data)
    await Bun.write(path, content)
  } catch (error) {
    throw new Error(
      `Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Use Bun.glob for pattern matching
 * Can be used for bulk file detection
 */
export async function findFiles(
  pattern: string,
  cwd?: string
): Promise<string[]> {
  const glob = new Bun.Glob(pattern)
  const files: string[] = []
  for await (const file of glob.scan({ cwd: cwd ?? ".", absolute: true })) {
    files.push(file)
  }
  return files
}

// Helper utilities
function isNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")
    )
  }
  return false
}

/**
 * Resolve path relative to a directory
 * Utility for safe path joining
 */
export function resolveAbsolute(dir: string, ...paths: string[]): string {
  // Use path.join for combining paths
  const combined = paths.join("/")
  // If combined path is already absolute, return it
  if (combined.startsWith("/")) return combined
  // Otherwise join with dir
  return `${dir}/${combined}`.replace(/\/+/g, "/")
}

/**
 * Check if a directory exists
 * Uses Bun.file().stat() to check if path is a directory
 */
export async function directoryExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path)
    const stat = await file.stat()
    return stat.isDirectory()
  } catch {
    return false
  }
}
