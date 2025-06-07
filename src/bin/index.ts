#!/usr/bin/env node

import { cyan, yellow } from "picocolors"

const argv = process.argv

async function main() {
  const terminalWidth = process.stdout.columns || 80
  const separator = "=".repeat(terminalWidth)
  console.log(separator)
  console.log()
  console.log(`Hi, thank you for using ${cyan("hulla cli")}! ❤️\n\n`)
  console.log(
`This is a a pre-release version to reserve the npm package name.\n
${yellow("If you're seeing this message even in production, please make sure you update to the latest version.\n")}`
  )
  console.log(
`Or if you're using npx / bunx / pnpm dlx make sure you use the latest version, for example: ${yellow("`npx hulla@latest`")}`
  )
  console.log()
  console.log(separator)
}

main().catch(console.error)