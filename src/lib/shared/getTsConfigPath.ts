import { findFiles } from "./bunUtils"

/**
 * List all possible tsconfig files in the user's directory
 * Searches recursively for tsconfig*.json files (e.g., tsconfig.json, tsconfig.app.json, tsconfig.base.json)
 */
export async function getTsConfigPath(dir: string): Promise<string[]> {
  const tsConfigFiles = await findFiles("**/tsconfig*.json", dir)
  return tsConfigFiles
}
