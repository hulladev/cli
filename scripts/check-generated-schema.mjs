import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const files = [
  "schemas/hulla.schema.json",
  "schemas/hulla.types.ts",
  "schemas/ui.schema.json",
  "schemas/ui.types.ts",
]
const before = await digest(files)
await run("bun", ["scripts/generate-schema.ts"])
const after = await digest(files)
if (before !== after)
  throw new Error(
    "Generated schemas were stale. Review and commit the regenerated files."
  )
process.stdout.write("Generated schemas are current.\n")

async function digest(paths) {
  const hash = createHash("sha256")
  for (const file of paths) hash.update(await readFile(path.join(root, file)))
  return hash.digest("hex")
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    )
  })
}
