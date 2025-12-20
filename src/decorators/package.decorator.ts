import { bold, green, inverse, red } from "picocolors"

export const packageDecorator = (
  variant: "normal" | "success" | "error" = "normal",
  message: string = " @hulla/cli "
) => {
  const text =
    variant === "normal"
      ? message
      : variant === "success"
        ? green(message)
        : red(message)
  return inverse(bold(text))
}
