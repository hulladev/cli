import { cyan, underline } from "picocolors"

export const pathDecorator = (path: string) => {
  return underline(cyan(path))
}
