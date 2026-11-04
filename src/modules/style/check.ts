import { checkPackages } from "@/checks/packages"
import { declares, type IntegrationCheck } from "@/checks/types"

export const styleCheck: IntegrationCheck = {
  name: "style",
  detect: (context) =>
    declares(context, "@hulla/style") ||
    declares(context, "@hulla/style-native"),
  check: (context) =>
    checkPackages(context, [
      "@hulla/style",
      ...(declares(context, "@hulla/style-native")
        ? ["@hulla/style-native"]
        : []),
    ]),
}
