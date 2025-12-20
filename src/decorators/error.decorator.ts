import { bold, red } from "picocolors"

export const errorDecorator = (message: string) => {
  return bold(red(message))
}
