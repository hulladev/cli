import { findInstalledPackage, type PackageJson } from "@/platform/package-json"
import { resolve } from "node:path"

export const databaseCliPackage = "@hulla/db-cli"

export function databaseBinary({ bin }: Pick<PackageJson, "bin">) {
  return typeof bin === "string" ? bin : bin?.["hulla-db"]
}

/** Extract the wrapper's cwd option and leave command parsing to hulla-db. */
export function getDatabaseInvocation(args: string[]) {
  const commandIndex =
    args[0] === "--cwd" ? 2 : args[0]?.startsWith("--cwd=") ? 1 : 0
  if (args[commandIndex] !== "db") return null

  const argv: string[] = []
  let cwd: string | undefined
  for (let index = 0; index < args.length; index++) {
    if (index === commandIndex) continue
    const arg = args[index]
    if (arg === "--") {
      argv.push(...args.slice(index))
      break
    }
    if (arg === "--cwd" || arg.startsWith("--cwd=")) {
      const value = arg === "--cwd" ? args[++index] : arg.slice(6)
      if (!value?.trim() || (arg === "--cwd" && value.startsWith("-"))) {
        throw new Error("--cwd requires a directory")
      }
      if (cwd !== undefined && cwd !== value) {
        throw new Error("Conflicting --cwd values. Pass it once.")
      }
      cwd = value
    } else {
      argv.push(arg)
    }
  }

  if (!argv.length || ["--check", "--help", "-h"].includes(argv[0])) return null
  return { cwd, argv }
}

export async function runDatabaseCLI(cwd: string, argv: string[]) {
  const installed =
    (await findInstalledPackage(cwd, databaseCliPackage)) ??
    (await findInstalledPackage(cwd, "@hulla/db"))
  if (!installed) {
    throw new Error(
      `No ${databaseCliPackage} installation was found from ${cwd}. Run hulla install @hulla/db in that project to add the database tools.`
    )
  }
  const executable = databaseBinary(installed.manifest)
  if (!executable) {
    throw new Error(
      `${installed.manifest.name} does not provide a hulla-db binary. Install ${databaseCliPackage} in this project.`
    )
  }

  const child = Bun.spawn(
    [process.execPath, resolve(installed.directory, executable), ...argv],
    { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" }
  )
  const interrupt = () => child.kill("SIGINT")
  const terminate = () => child.kill("SIGTERM")
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", terminate)
  try {
    return await child.exited
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", terminate)
  }
}
