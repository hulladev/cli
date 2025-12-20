import { green } from "picocolors"

export const successDecorator = (message: string) => {
  return green(message)
}
