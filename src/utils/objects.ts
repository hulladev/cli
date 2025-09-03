export function keys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}

export function entries<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][]
}

export function filterBy<T extends object>(
  obj: T,
  fn: (value: T[keyof T]) => boolean
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filteredEntries = entries(obj).filter(([_, value]) => fn(value))
  return Object.fromEntries(filteredEntries) as Partial<T>
}

export function omit<T extends object, const K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K))
  ) as Omit<T, K>
}
