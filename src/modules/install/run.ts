import { commandErr, commandOkMessage } from "@/app/result"
import { getCliCwd } from "@/app/runtime"
import type { CommandModule } from "@/app/types"
import { databaseBinary, databaseCliPackage } from "@/modules/db/proxy"
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

const packageScripts: Record<string, Record<string, string>> = {
  "@hulla/db": databaseScripts,
  [databaseCliPackage]: databaseScripts,
  "@hulla/api-openapi": { "api:openapi": "hulla-openapi export" },
  "@hulla/ui": { "ui:generate": "uigen", "ui:check": "uigen --check" },
}

async function installPackages(command: string, specs: string[], cwd: string) {
  const proc = Bun.spawn([...command.trim().split(/\s+/), ...specs], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(
      `Failed to install ${specs.join(", ")} (exit code: ${exitCode}).`
    )
  }
}

export const runInstall: CommandModule["run"] = async ({ context, result }) => {
  const packages = result.arguments.packages?.value
  if (!Array.isArray(packages) || !packages.length) {
    return commandErr(
      new Error(
        "Pass at least one package, for example hulla install @hulla/db."
      )
    )
  }
  const targets = packages.map((spec: unknown) => {
    const match =
      typeof spec === "string" &&
      /^(hulla|@hulla\/[a-z0-9][a-z0-9._-]*)(?:@\S+)?$/.exec(spec)
    if (!match) {
      throw new Error(
        `hulla install accepts @hulla/* packages and hulla: ${spec}`
      )
    }
    return { name: match[1], spec: match[0] }
  })
  const enableScripts = result.arguments.scripts?.detected
  const disableScripts = result.arguments["no-scripts"]?.detected
  if (enableScripts && disableScripts) {
    throw new Error("Choose either --scripts or --no-scripts.")
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
  const database = targets.find(({ name }) => name === "@hulla/db")
  const explicitDatabaseCli = targets.find(
    ({ name }) => name === databaseCliPackage
  )
  const devCommand = install?.addDev ?? ""
  const installCommand = result.arguments.dev?.detected
    ? devCommand
    : install?.add
  if (!installCommand?.trim() || (database && !devCommand.trim())) {
    throw new Error(
      "Set packageManager in package.json, create a package manager lockfile, or configure cli.scripts.add and cli.scripts.addDev."
    )
  }

  const recipes = Object.assign(
    {},
    ...targets.map(({ name }) => packageScripts[name])
  ) as Record<string, string>
  const missing = Object.entries(recipes).filter(
    ([name]) => !Object.hasOwn(manifest.scripts ?? {}, name)
  )
  const scriptMode = config?.cli.install?.scripts ?? "prompt"
  const addScripts =
    missing.length > 0 &&
    !disableScripts &&
    (enableScripts ||
      scriptMode === "always" ||
      (scriptMode === "prompt" &&
        !isPromptNonInteractive() &&
        process.stdin.isTTY &&
        process.stdout.isTTY &&
        (await confirm({
          message: `Add ${missing.map(([name]) => name).join(" and ")} to package.json?`,
          initialValue: true,
        }))))

  const baseSpecs = targets
    .filter(({ name }) => !database || name !== databaseCliPackage)
    .map(({ spec }) => spec)
  await installPackages(installCommand, baseSpecs, cwd)
  let message = `Installed ${baseSpecs.join(", ")}`
  if (database) {
    const installed = await findInstalledPackage(cwd, database.name)
    if (!installed) {
      throw new Error("Cannot resolve the installed @hulla/db version.")
    }
    // Older SDK releases already contain the database command.
    if (explicitDatabaseCli || !databaseBinary(installed.manifest)) {
      const version = database.spec.startsWith("@hulla/db@workspace:")
        ? "workspace:*"
        : installed.manifest.version
      const cliSpec =
        explicitDatabaseCli?.spec ?? `${databaseCliPackage}@${version}`
      await installPackages(devCommand, [cliSpec], cwd)
      message += ` and added ${cliSpec} as a dev dependency`
    }
  }

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
