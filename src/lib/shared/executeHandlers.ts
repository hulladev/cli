import type {
  HandlerFunction,
  HullaConfig,
  ParserResult,
  SwitchMap,
} from "@/types"
import { filterBy, keys } from "@/utils/objects"

// Generic switch map type for nested structures - all keys must be present
// This ensures type safety: all keys from T[On] must have handlers
type GenericSwitchMap<
  On extends "arguments" | "commands",
  T extends {
    [K in On]: Record<string, unknown>
  },
> = {
  [K in keyof T[On]]: (data: {
    result: T[On][K]
    parserResult: ParserResult
    config: HullaConfig
  }) => unknown | Promise<unknown>
}

type WithDetected<T> = {
  [K in keyof T]: T[K] & { detected: boolean }
}

async function executeSwitchWithCondition<
  const On extends "arguments" | "commands",
  const T extends {
    [K in On]: Record<string, unknown>
  },
  const SM extends GenericSwitchMap<On, T>,
>(
  on: On,
  obj: T[On],
  parserResult: ParserResult,
  config: HullaConfig,
  handlerKeys: Array<keyof T[On] & keyof SM>,
  switchMap: SM
) {
  const resultMap = new Map<
    keyof T[On] & keyof SM,
    Awaited<ReturnType<NonNullable<SM[keyof T[On] & keyof SM]>>>
  >()
  await Promise.all(
    handlerKeys.map(async (key) => {
      const fn = switchMap[key]
      if (!fn) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (obj as any)[key]
      if (value !== undefined) {
        const result = await fn({
          result: value,
          parserResult,
          config,
        })
        resultMap.set(
          key,
          result as Awaited<ReturnType<NonNullable<SM[typeof key]>>>
        )
      }
    })
  )
  return resultMap
}

// Overload for ParserResult with SwitchMap
export async function executeHandlers<
  const T extends ParserResult,
  const On extends Extract<keyof T, "arguments" | "commands">,
  const SM extends SwitchMap<On>,
>(params: {
  result: T
  on: On
  parserResult: ParserResult
  config: HullaConfig
  handlers: SM
}): Promise<
  Map<
    keyof T[On] & keyof SM,
    Awaited<ReturnType<NonNullable<SM[keyof T[On] & keyof SM]>>>
  >
>

// Overload for generic nested structures
export async function executeHandlers<
  const T extends {
    [K in On]: Record<string, unknown>
  },
  const On extends "arguments" | "commands",
  const SM extends GenericSwitchMap<On, T>,
>(params: {
  result: T
  on: On
  parserResult: ParserResult
  config: HullaConfig
  handlers: SM
}): Promise<
  Map<
    keyof T[On] & keyof SM,
    Awaited<ReturnType<NonNullable<SM[keyof T[On] & keyof SM]>>>
  >
>

// Implementation
export async function executeHandlers<
  const T extends
    | ParserResult
    | {
        [K in On]: Record<string, unknown>
      },
  const On extends Extract<keyof T, "arguments" | "commands">,
  const SM extends GenericSwitchMap<On, T> | SwitchMap<On>,
>(params: {
  result: T
  on: On
  parserResult: ParserResult
  config: HullaConfig
  handlers: SM
}): Promise<Map<keyof T[On] & keyof SM, unknown>> {
  const { result, on, parserResult, config, handlers } = params
  const objAccess = result[on] as WithDetected<T[On]>
  const handlerKeys = keys(
    filterBy(objAccess, (value) => value.detected)
  ) as Array<keyof T[On] & keyof SM>

  // Check if this is a ParserResult with SwitchMap
  if (result === parserResult) {
    const resultMap = new Map<
      keyof T[On] & keyof SM,
      Awaited<ReturnType<NonNullable<SM[keyof T[On] & keyof SM]>>>
    >()
    await Promise.all(
      handlerKeys.map(async (key) => {
        const fn = (handlers as SwitchMap<On>)[
          key as keyof SwitchMap<On>
        ] as unknown as HandlerFunction<On, keyof ParserResult[On]>
        if (fn) {
          const handlerResult = await fn({
            result: objAccess[
              key
            ] as unknown as ParserResult[On][keyof ParserResult[On]],
            parserResult: result as ParserResult,
            config,
          })
          resultMap.set(
            key,
            handlerResult as Awaited<ReturnType<NonNullable<SM[typeof key]>>>
          )
        }
      })
    )
    return resultMap
  }

  // Generic nested path
  return executeSwitchWithCondition(
    on,
    objAccess as T[On],
    parserResult,
    config,
    handlerKeys,
    handlers as GenericSwitchMap<On, T>
  ) as unknown as Promise<Map<keyof T[On] & keyof SM, unknown>>
}
