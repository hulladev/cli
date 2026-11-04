import { checkFlag, commonArguments } from "@/app/arguments"
import type { CommandModule } from "@/app/types"
import { command } from "@hulla/args"
import { runIntegrationChecks } from "./run"

export const checkModules: CommandModule[] = [
  ...["style", "db", "control"].map((name) => ({
    name,
    definition: command({
      name,
      description: `Check the local @hulla/${name} integration`,
      arguments: [checkFlag, ...commonArguments],
    }),
    run: ({ context }: Parameters<CommandModule["run"]>[0]) =>
      runIntegrationChecks(context, name),
  })),
  {
    name: "doctor",
    definition: command({
      name: "doctor",
      description: "Detect installed integrations and run their local checks",
      arguments: [...commonArguments],
    }),
    run: ({ context }) => runIntegrationChecks(context),
  },
]
