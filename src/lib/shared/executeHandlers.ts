import { filterBy, keys } from "@/utils/objects"
import type { HullaConfigSchema } from "schemas/hulla.types"

export async function executeSwitchWithCondition<
  const T extends object,
  const SM extends {
    [K in keyof T]: (value: T[K], config: HullaConfigSchema) => unknown
  },
>(obj: T, config: HullaConfigSchema, on: Array<keyof T>, switchMap: SM) {
  const resultMap = new Map<keyof T, SM[keyof T]>()
  await Promise.all(
    on.map(async (key) => {
      const fn = key && switchMap[key]
      if (fn) {
        // @ts-expect-error - mapping of SM can be unrelated to obj / on generic wise
        const result = await fn(obj[key], config)
        // @ts-expect-error - mapping of SM can be unrelated to obj / on generic wise
        resultMap.set(key, result)
      }
    })
  )
  return resultMap
}

export async function executeHandlers<
  const T extends Record<string, { detected: boolean }>,
  const SM extends {
    [K in keyof T]: (value: T[K], config: HullaConfigSchema) => unknown
  },
>(obj: T, config: HullaConfigSchema, switchMap: SM) {
  const on = keys(filterBy(obj, (value) => value.detected))
  return executeSwitchWithCondition(obj, config, on, switchMap)
}
