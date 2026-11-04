import { checkPackages } from "@/checks/packages"
import { declares, type IntegrationCheck } from "@/checks/types"

export const controlCheck: IntegrationCheck = {
  name: "control",
  detect: (context) => declares(context, "@hulla/control"),
  check: (context) => checkPackages(context, ["@hulla/control"]),
}
