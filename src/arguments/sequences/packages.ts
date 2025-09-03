import { z } from "zod"
import { infiniteSequence } from "@hulla/args"

type Prefixed<T extends string> = `@hulla/${T}`

const packages = ["args", "control", "ui", "style", "rpc"] as const
const prefixedPackages = packages.map((pkg) => `@hulla/${pkg}`) as Prefixed<
  (typeof packages)[number]
>[]

export const packagesSchema = z.enum([...packages, ...prefixedPackages])

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "Packages to install",
})

export type Packages = typeof packages
