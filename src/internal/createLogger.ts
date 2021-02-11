import { debug } from 'debug'

export function createLogger(name: string) {
  return debug(`pageWith:${name}`)
}
