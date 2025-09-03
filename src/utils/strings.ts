export function returnOnMatch<const M extends string[]>(
  compare: string,
  ...matches: M
): M[number] | null {
  for (const match of matches) {
    if (compare.includes(match)) {
      return match
    }
  }
  return null
}
