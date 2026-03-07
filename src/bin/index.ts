#!/usr/bin/env bun
import { runCli } from "@/app/entrypoint"

runCli()
  .then(({ exitCode }) => {
    process.exit(exitCode)
  })
  .catch(console.error)
