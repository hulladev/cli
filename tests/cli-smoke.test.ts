import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const PROJECT_ROOT = join(import.meta.dir, "..")

describe("cli smoke", () => {
  test("prints version through the real process entrypoint", async () => {
    const result = await runCliProcess(["--version"])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("hulla v0.0.0-alpha.1")
  })

  test("returns a parser failure through the real process entrypoint", async () => {
    const result = await runCliProcess(["wat"])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Unfortunately we encountered the following error")
  })

  test("runs a happy-path command through the real process entrypoint", async () => {
    const result = await runCliProcess(["install"])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Directory exists")
  })
})

async function runCliProcess(args: string[]): Promise<{
  exitCode: number
  output: string
}> {
  const proc = Bun.spawn([process.execPath, "src/bin/index.ts", ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return {
    exitCode,
    output: `${stdout}\n${stderr}`.trim(),
  }
}
