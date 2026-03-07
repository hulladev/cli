import { boldDecorator } from "./bold.decorator"
import { errorDecorator } from "./error.decorator"
import { highlightDecorator } from "./highlight.decorator"
import { packageDecorator } from "./package.decorator"
import { pathDecorator } from "./path.decorator"
import { secondaryDecorator } from "./secondary.decorator"
import { successDecorator } from "./sucess.decorator"

export const d = {
  path: pathDecorator,
  error: errorDecorator,
  highlight: highlightDecorator,
  package: packageDecorator,
  secondary: secondaryDecorator,
  success: successDecorator,
  bold: boldDecorator,
}
