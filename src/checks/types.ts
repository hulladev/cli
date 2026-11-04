import type { HullaConfig } from "@/app/types"
import type { PackageJson } from "@/platform/package-json"

export type CheckResult = {
  id: string
  status: "pass" | "warning" | "failure" | "skipped"
  message: string
  fix?: string
}

export type CheckContext = {
  root: string
  manifest: PackageJson
  dependencies: Record<string, string>
  config: HullaConfig | null
  apiConfigPath?: string
}

export type IntegrationCheck = {
  name: string
  detect(context: CheckContext): boolean
  check(context: CheckContext): Promise<CheckResult[]>
}

export function declares(context: CheckContext, name: string): boolean {
  return Object.hasOwn(context.dependencies, name)
}
