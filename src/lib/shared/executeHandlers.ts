import type {
  HandlerFunction,
  HullaConfig,
  ParserResult,
  SwitchMap,
} from "@/types.private"
import { filterBy, keys } from "@/utils/objects"

export async function executeSwitchWithCondition<
  const On extends Extract<keyof ParserResult, "arguments" | "commands">,
  const T extends ParserResult[On],
  const SM extends SwitchMap<On>,
>(
  on: On,
  obj: T,
  parserResult: ParserResult,
  config: HullaConfig,
  handlerKeys: Array<keyof T & keyof SM>,
  switchMap: SM
) {
  const resultMap = new Map<
    keyof T & keyof SM,
    Awaited<ReturnType<SM[keyof T & keyof SM]>>
  >()
  await Promise.all(
    handlerKeys.map(async (key) => {
      const fn = switchMap[key as keyof SM] as unknown as HandlerFunction<
        On,
        keyof ParserResult[On]
      >
      if (fn) {
        const result = await fn({
          result: obj[
            key
          ] as unknown as ParserResult[On][keyof ParserResult[On]],
          parserResult,
          config,
        })
        resultMap.set(key, result as Awaited<ReturnType<SM[typeof key]>>)
      }
    })
  )
  return resultMap
}

type WithDetected<T> = {
  [K in keyof T]: T[K] & { detected: boolean }
}

export async function executeHandlers<
  const T extends ParserResult,
  const On extends Extract<keyof T, "arguments" | "commands">,
  const SM extends SwitchMap<On>,
>(obj: T, on: On, config: HullaConfig, switchMap: SM) {
  const objAccess = obj[on] as WithDetected<T[On]>
  const handlerKeys = keys(
    filterBy(objAccess, (value) => value.detected)
  ) as Array<keyof T[On] & keyof SM>
  return executeSwitchWithCondition(
    on,
    objAccess as T[On],
    obj,
    config,
    handlerKeys,
    switchMap
  )
}
