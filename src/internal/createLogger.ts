import { debug } from 'debug'

export function createLogger(name: string): ReturnType<typeof debug> {
  return debug(`pageWith:${name}`)
}
