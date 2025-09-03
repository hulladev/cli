import { outro } from "../outro"
import pc from "picocolors"

export function goodbye(message: string) {
  outro(
    message ??
      `Thank you for using ${pc.bold("hulla CLI")}. It really means the world to me ❤️\n
If you have any feedback, please let me know on ${pc.bold("https://github.com/hulladev/cli/issues")}
and if you enjoy the package, don't forget to give it a star ⭐️`
  )
}
