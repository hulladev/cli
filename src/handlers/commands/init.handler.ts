import { Command } from "@/cli"
import { HandlerOutput } from "../types.handler"
import { Err, err, Ok, ok } from "@hulla/control"
import { existsSync } from "fs"
import { intro } from "@/prompts/intro"
import pc from "picocolors"
import { getHullaConfig } from "@/lib/getHullaConfig"
import { HullaConfigSchema } from "schemas/hulla.schema"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import {
  getPackageJson,
  getPackageManagerFromLockfile,
  PackageJson,
} from "@/lib/getPackageFiles"
import { returnOnMatch } from "@/utils/strings"
import { getConfigScripts } from "@/lib/getConfigScripts"
import { note } from "@/prompts/note"
import { PackageManager } from "@/types.private"
import { cliPrefix } from "@/prompts/templates/cliPrefix"
import { select } from "@/prompts/select"
import { text } from "@/prompts/text"

export async function init(c: Command<"init">): Promise<HandlerOutput> {
  const dir = c.arguments.path?.value ?? process.cwd()
  intro(`🚀 Setting up a new ${pc.blue("hulla")} project in: ${pc.green(dir)}`)
  try {
    if (!existsSync(dir)) {
      throw new Error(`Directory ${dir} does not exist`)
    }
    return ok({
      type: "success",
      message: "Hulla project initialized",
      fn: "success",
    })
  } catch (e) {
    return err(e as Error)
  }
}

export async function initHullaProject(
  dir: string
): Promise<Ok<HullaConfigSchema> | Err<Error>> {
  // 1. Config detection
  if (!existsSync(dir)) {
    throw new Error(
      `Directory ${pc.red(dir)} does not exist. Either cd to a valid directory or correct the ${pc.bold("--path")} option`
    )
  }
  const hullaProject = await getHullaConfig(dir)
  // Project already initialized, early return with config, no need to continue
  if (hullaProject) return ok(hullaProject)
  await log.warn(`There's no .hulla project in ${dir}`)
  const initConfirmed = await confirm({
    message:
      "Would you like to initialize a new hulla CLI project in this directory?",
    initialValue: true,
  })
  if (!initConfirmed) {
    return err(new Error("User cancelled"))
  }
  const packageJson = await getPackageJson(dir, "package.json")
  if (!packageJson) {
    return err(new Error("No package.json found"))
  }
  // 2. Scripts detection
  const { scripts, packageManager } = await detectScriptsAndManager(
    packageJson,
    dir
  )
}

async function detectScriptsAndManager(
  packageJson: PackageJson,
  dir: string
): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: string
}> {
  let scripts: HullaConfigSchema["cli"]["scripts"]
  let packageManager: PackageManager | "other" | null = null
  // Attempt to auto-detect values
  if (packageJson.packageManager) {
    packageManager = returnOnMatch(
      packageJson.packageManager,
      "pnpm",
      "npm",
      "yarn",
      "bun"
    )
    if (packageManager) {
      scripts = getConfigScripts(packageManager)
    }
  } else {
    packageManager = getPackageManagerFromLockfile(dir)
    if (packageManager) {
      scripts = getConfigScripts(packageManager)
    } else {
    }
  }
  // Auto-detected, verify values with user
  // ⚠️ dev note: in current code it's impossible to reach a state where scripts are defined and pakcageManager isnt
  // however if this were ever to occur in future, please add a handling flow below
  if (scripts && packageManager) {
    await log.info(
      `${cliPrefix} Autodetected ${pc.green(packageManager)} as package manager`
    )
    const { scripts: newScripts, packageManager: newPackageManager } =
      await loopSelectProperties({
        scripts,
        packageManager,
        didManuallyEditScripts: false,
      })
    scripts = newScripts
    packageManager = newPackageManager
  } else {
    // Failed to auto-detect, prompt user for values
    const { scripts: newScripts, packageManager: newPackageManager } =
      await loopSelectProperties({
        scripts,
        packageManager,
        didManuallyEditScripts: false,
        executePhase: "editScripts",
      })
    scripts = newScripts
    packageManager = newPackageManager
  }
}

const loopSelectProperties = async (props: {
  scripts: HullaConfigSchema["cli"]["scripts"] | undefined
  packageManager: PackageManager | "other" | null
  didManuallyEditScripts: boolean
  executePhase?: "editScripts" | "editPackageManager" | "use"
}): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: PackageManager | "other"
}> => {
  await note(
    JSON.stringify(props.scripts, null, 2)
      .replaceAll("{", "")
      .replaceAll("}", ""),
    `${pc.bold(" We'll use the following scripts ")}`
  )
  let editScriptsConfirmed:
    | "editScripts"
    | "editPackageManager"
    | "use"
    | undefined = props.executePhase
  if (!editScriptsConfirmed) {
    editScriptsConfirmed = await select({
      message: "What would you like to do?",
      options: [
        { label: "Edit scripts", value: "editScripts" },
        { label: "Edit package manager", value: "editPackageManager" },
        {
          label: props.didManuallyEditScripts
            ? "Use the suggested script values ✅"
            : "The values you provided are correct ✅",
          value: "use",
        },
      ],
      initialValue: "use",
    })
  }
  if (editScriptsConfirmed === "use") {
    return { scripts: props.scripts, packageManager: props.packageManager }
  } else if (editScriptsConfirmed === "editPackageManager") {
    const packageManagerConfirmed = await select({
      message: "What package manager would you like to use?",
      options: [
        { label: "npm", value: "npm" },
        { label: "pnpm", value: "pnpm" },
        { label: "yarn", value: "yarn" },
        { label: "bun", value: "bun" },
        { label: "Other (specify)", value: "other" },
      ],
      initialValue: props.packageManager as PackageManager,
    })
    if (packageManagerConfirmed !== "other") {
      const scripts = getConfigScripts(packageManagerConfirmed)
      return loopSelectProperties({
        scripts,
        packageManager: packageManagerConfirmed,
        didManuallyEditScripts: false,
      })
    } else {
      const scriptValues = await manualScriptsInput(props.scripts)
      return loopSelectProperties({
        scripts: scriptValues,
        packageManager: props.packageManager,
        didManuallyEditScripts: true,
      })
    }
  } else if (editScriptsConfirmed === "editScripts") {
    const scriptValues = await manualScriptsInput(props.scripts)
    return loopSelectProperties({
      scripts: scriptValues,
      packageManager: props.packageManager,
      didManuallyEditScripts: true,
    })
  } else {
    return { scripts: props.scripts, packageManager: props.packageManager }
  }
}

const manualScriptsInput = async (
  scriptValues: HullaConfigSchema["cli"]["scripts"] | undefined
): Promise<HullaConfigSchema["cli"]["scripts"]> => {
  const defaultScriptValues: HullaConfigSchema["cli"]["scripts"] = {
    add: scriptValues?.add ?? "",
    addDev: scriptValues?.addDev ?? "",
    uninstall: scriptValues?.uninstall ?? "",
    upgrade: scriptValues?.upgrade ?? "",
  }
  const result: HullaConfigSchema["cli"]["scripts"] = defaultScriptValues
  for await (const [key, value] of Object.entries(defaultScriptValues)) {
    const scriptValue = await text({
      message: `What would you like to use for ${key}?`,
      placeholder: "Enter a value",
      initialValue: value,
    })
    result[key as keyof HullaConfigSchema["cli"]["scripts"]] = scriptValue
  }
  return result
}
