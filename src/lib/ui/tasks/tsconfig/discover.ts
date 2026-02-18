import { getTsConfigPath } from "@/lib/shared/getTsConfigPath"

export async function discoverTsconfigPaths(dir: string): Promise<string[]> {
  const tsconfigPaths = await getTsConfigPath(dir)
  return tsconfigPaths.filter((path) => !path.includes("node_modules"))
}
