export function makeUrl(url: string, base?: string): string {
  const result = ((base || '') + url).replace(/(?<!:)\/{2,}/g, '/')
  return result
}
