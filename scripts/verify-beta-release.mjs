import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
)
if (!/^0\.0\.\d+-beta\.\d+$/.test(packageJson.version)) {
  throw new Error(`Refusing non-beta hulla version ${packageJson.version}`)
}
const preState = JSON.parse(
  await readFile(path.join(root, ".changeset/pre.json"), "utf8")
)
if (preState.mode !== "pre" || preState.tag !== "beta") {
  throw new Error("Refusing publication without active beta prerelease mode")
}

for (const file of await readdir(path.join(root, ".changeset"))) {
  if (!file.endsWith(".md") || file === "README.md") continue
  const source = await readFile(path.join(root, ".changeset", file), "utf8")
  if (/"hulla":\s*(major|minor)/.test(source))
    throw new Error(`Refusing non-patch hulla changeset: ${file}`)
}
process.stdout.write(
  `Release guard accepted hulla ${packageJson.version} for npm tag beta.\n`
)
