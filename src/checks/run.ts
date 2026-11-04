import { getStringOption } from "@/app/options"
import { commandErr, commandOk } from "@/app/result"
import { getCliCwd } from "@/app/runtime"
import type { CommandContext } from "@/app/types"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import { readJsonFile } from "@/platform/fs/bun"
import type { PackageJson } from "@/platform/package-json"
import { join, relative, resolve } from "node:path"
import { discoverCheckProjects } from "./projects"
import { integrationChecks } from "./registry"
import type { CheckContext, CheckResult } from "./types"

export type ProjectChecks = {
  root: string
  name: string
  integration: string
  results: CheckResult[]
}

export async function inspectIntegrations(input: {
  cwd: string
  integration?: string
  projectConfigPath?: string
  apiConfigPath?: string
}): Promise<ProjectChecks[]> {
  const checks = input.integration
    ? integrationChecks.filter((check) => check.name === input.integration)
    : integrationChecks
  if (!checks.length)
    throw new Error(`Unknown integration: ${input.integration}`)
  const projects = await discoverCheckProjects(input.cwd)
  const reports: ProjectChecks[] = []
  for (const root of projects) {
    let context: CheckContext
    try {
      const manifest = await readJsonFile<PackageJson>(
        join(root, "package.json")
      )
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        throw new Error("package.json must contain an object.")
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ] as const) {
        const value = manifest[field]
        if (
          value !== undefined &&
          (!value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            Object.values(value).some((spec) => typeof spec !== "string"))
        )
          throw new Error(
            `package.json ${field} must map package names to version strings.`
          )
      }
      const workspaces = manifest.workspaces
      if (workspaces !== undefined) {
        const patterns = Array.isArray(workspaces)
          ? workspaces
          : workspaces?.packages
        if (
          !Array.isArray(patterns) ||
          !patterns.every((pattern) => typeof pattern === "string")
        )
          throw new Error(
            "package.json workspaces must be an array of patterns or an object with a packages array."
          )
      }
      // Explicit options belong to the selected project. Child workspaces use
      // their own defaults rather than inheriting a parent's config path.
      const projectConfigPath =
        root === projects[0] && input.projectConfigPath
          ? resolve(input.cwd, input.projectConfigPath)
          : undefined
      const config = await readHullaConfig(root, projectConfigPath)
      if (projectConfigPath && !config)
        throw new Error(`Project config not found: ${projectConfigPath}`)
      context = {
        root,
        manifest,
        dependencies: {
          ...manifest.peerDependencies,
          ...manifest.devDependencies,
          ...manifest.dependencies,
        },
        config,
        apiConfigPath:
          root === projects[0] && input.apiConfigPath
            ? resolve(input.cwd, input.apiConfigPath)
            : undefined,
      }
    } catch (error) {
      reports.push({
        root,
        name: relative(input.cwd, root) || ".",
        integration: "project",
        results: [
          {
            id: "project:config",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            fix: "Correct the project manifest or .hulla project config.",
          },
        ],
      })
      continue
    }
    for (const check of checks) {
      let results: CheckResult[]
      try {
        if (
          !check.detect(context) &&
          !(check.name === "api" && context.apiConfigPath)
        )
          continue
        results = await check.check(context)
      } catch (error) {
        results = [
          {
            id: `${check.name}:config`,
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            fix: `Correct the ${check.name} configuration and rerun hulla ${check.name} --check.`,
          },
        ]
      }
      reports.push({
        root,
        name: context.manifest.name ?? (relative(input.cwd, root) || "."),
        integration: check.name,
        results,
      })
    }
  }
  if (!reports.length)
    reports.push({
      root: resolve(input.cwd),
      name: ".",
      integration: input.integration ?? "doctor",
      results: [
        {
          id: "integrations:absent",
          status: "skipped",
          message: input.integration
            ? `No ${input.integration} integration detected.`
            : "No supported integrations detected.",
        },
      ],
    })
  return reports
}

export async function runIntegrationChecks(
  context: CommandContext,
  integration?: string
) {
  const { parserResult, terminal } = context
  const cwd = getCliCwd()
  const reports = await inspectIntegrations({
    cwd,
    integration,
    projectConfigPath:
      getStringOption(parserResult, "project-config") ??
      (integration === "api"
        ? undefined
        : getStringOption(parserResult, "config")),
    apiConfigPath:
      integration === "api"
        ? getStringOption(parserResult, "config")
        : undefined,
  })
  const totals = { pass: 0, warning: 0, failure: 0, skipped: 0 }
  for (const report of reports) {
    terminal.log.info(
      `${report.name} (${relative(cwd, report.root) || "."}) — ${report.integration}`
    )
    for (const result of report.results) {
      totals[result.status]++
      const message = `${result.status.toUpperCase()} ${result.message}${result.fix ? `\n  Fix: ${result.fix}` : ""}`
      if (result.status === "failure") terminal.log.error(message)
      else if (result.status === "warning") terminal.log.warn(message)
      else if (result.status === "pass") terminal.log.success(message)
      else terminal.log.info(message)
    }
  }
  const summary = `${totals.pass} passed, ${totals.warning} warnings, ${totals.failure} failures, ${totals.skipped} skipped.`
  return totals.failure
    ? commandErr(new Error(summary))
    : commandOk(summary, reports)
}
