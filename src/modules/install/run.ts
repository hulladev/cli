import { commandErr, commandOkMessage } from "@/app/result"
import { getCliCwd } from "@/app/runtime"
import type { CommandModule } from "@/app/types"
import { databaseCliPackage } from "@/modules/db/proxy"
import { getConfigScripts } from "@/modules/init/services/config-scripts"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import {
  detectPackageManager,
  findInstalledPackage,
  getPackageJson,
} from "@/platform/package-json"
import { confirm } from "@/terminal/prompts/confirm"
import { isPromptNonInteractive } from "@/terminal/prompts/runtime"
import { join } from "node:path"

const databaseScripts = {
  "db:generate": "hulla-db generate",
  "db:dev": "hulla-db dev",
}

async function installPackage(command: string, spec: string, cwd: string) {
  const proc = Bun.spawn([...command.trim().split(/\s+/), spec], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Failed to install ${spec} (exit code: ${exitCode}).`)
  }
}

export const runInstall: CommandModule["run"] = async ({ context, result }) => {
  const packages = result.arguments.packages?.value
  const spec = Array.isArray(packages) && packages.length === 1 && packages[0]
  if (typeof spec !== "string" || !/^@hulla\/db(?:@\S+)?$/.test(spec)) {
    return commandErr(
      new Error(
        "hulla install supports one @hulla/db package spec. Use your package manager for other dependencies."
      )
    )
  }

  const cwd = getCliCwd()
  const manifest = await getPackageJson(cwd, "package.json")
  if (!manifest) throw new Error(`No package.json found in ${cwd}.`)

  const config = await readHullaConfig(cwd, context.config.path)
  const detection = config ? null : await detectPackageManager(cwd)
  for (const warning of detection?.warnings ?? []) {
    context.terminal.log.warn(warning)
  }
  const install =
    config?.cli.scripts ?? (detection && getConfigScripts(detection.manager))
  if (!install?.add.trim() || !install.addDev.trim()) {
    throw new Error(
      "Set packageManager in package.json, create a package manager lockfile, or configure cli.scripts.add and cli.scripts.addDev."
    )
  }

  const missing = Object.entries(databaseScripts).filter(
    ([name]) => !Object.hasOwn(manifest.scripts ?? {}, name)
  )
  const addScripts =
    missing.length > 0 &&
    (result.arguments["db-scripts"]?.detected ||
      (!isPromptNonInteractive() &&
        process.stdin.isTTY &&
        process.stdout.isTTY &&
        (await confirm({
          message: `Add ${missing.map(([name]) => name).join(" and ")} to package.json?`,
          initialValue: false,
        }))))

  await installPackage(install.add, spec, cwd)
  const installed = await findInstalledPackage(cwd, "@hulla/db")
  if (!installed) {
    throw new Error("Cannot resolve the installed @hulla/db version.")
  }
  const cliVersion = spec.startsWith("@hulla/db@workspace:")
    ? "workspace:*"
    : installed.manifest.version
  const cliSpec = `${databaseCliPackage}@${cliVersion}`
  await installPackage(install.addDev, cliSpec, cwd)
  const message = `Installed ${spec} and added ${cliSpec} as a dev dependency`

  if (addScripts) {
    const installedManifest = await getPackageJson(cwd, "package.json")
    if (!installedManifest) throw new Error(`No package.json found in ${cwd}.`)
    const scripts = installedManifest.scripts ?? {}
    const additions = missing.filter(([name]) => !Object.hasOwn(scripts, name))
    if (additions.length > 0) {
      installedManifest.scripts = {
        ...scripts,
        ...Object.fromEntries(additions),
      }
      await Bun.write(
        join(cwd, "package.json"),
        `${JSON.stringify(installedManifest, null, 2)}\n`
      )
      return commandOkMessage(
        `${message}. Added ${additions.map(([name]) => name).join(" and ")}.`
      )
    }
  }

  return commandOkMessage(`${message}.`)
}

export const installRunner = runInstall
