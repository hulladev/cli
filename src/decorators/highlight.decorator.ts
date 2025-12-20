import { blue, bold } from "picocolors"

export const highlightDecorator = (message: string) => {
  return bold(blue(message))
}
