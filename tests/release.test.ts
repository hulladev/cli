import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const guard = fileURLToPath(
  new URL("../scripts/verify-release.mjs", import.meta.url)
)

for (const scenario of [
  {
    name: "accepts a stable release after prerelease exit",
    version: "0.1.0",
    prerelease: false,
    exitCode: 0,
  },
  {
    name: "rejects a beta version on latest",
    version: "0.1.0-beta.1",
    prerelease: false,
    exitCode: 1,
  },
  {
    name: "rejects unfinished prerelease state",
    version: "0.1.0",
    prerelease: true,
    exitCode: 1,
  },
]) {
  test(`release guard ${scenario.name}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "hulla-release-guard-"))
    try {
      await Bun.write(
        join(root, "package.json"),
        JSON.stringify({ name: "hulla", version: scenario.version })
      )
      if (scenario.prerelease) {
        await Bun.write(
          join(root, ".changeset/pre.json"),
          JSON.stringify({ mode: "pre", tag: "beta" })
        )
      }
      const child = Bun.spawn(["node", guard], {
        cwd: root,
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await child.exited).toBe(scenario.exitCode)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
