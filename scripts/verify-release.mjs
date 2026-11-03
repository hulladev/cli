import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const manifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
)
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

if (!stableVersion.test(manifest.version)) {
  throw new Error(
    `Refusing a prerelease or invalid version: ${manifest.version}`
  )
}

const prereleaseState = await readFile(
  path.join(root, ".changeset/pre.json")
).catch((error) => {
  if (error.code === "ENOENT") return null
  throw error
})

if (prereleaseState !== null) {
  throw new Error(
    "Finish Changesets prerelease exit and versioning before publishing to latest."
  )
}

process.stdout.write(
  `Release guard accepted ${manifest.name}@${manifest.version} for npm tag latest.\n`
)
