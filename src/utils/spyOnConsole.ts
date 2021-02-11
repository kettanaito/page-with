import { Page } from 'playwright'
import { createLogger } from '../internal/createLogger'

const log = createLogger('consoleSpy')

export type ConsoleMessageType =
  | 'info'
  | 'log'
  | 'debug'
  | 'error'
  | 'warning'
  | 'profile'
  | 'profileEnd'
  | 'table'
  | 'trace'
  | 'timeEnd'
  | 'startGroup'
  | 'startGroupCollapsed'
  | 'endGroup'
  | 'dir'
  | 'dirxml'
  | 'clear'
  | 'count'
  | 'assert'

export type ConsoleMessages = Map<ConsoleMessageType, string[]>

function removeConsoleStyles(message: string): string {
  return message.replace(/\(*(%s|%c|color:\S+)\)*\s*/g, '').trim()
}

export function spyOnConsole(page: Page): ConsoleMessages {
  const messages: ConsoleMessages = new Map()

  log('created a page console spy!')

  page.on('console', (message) => {
    const type = message.type() as ConsoleMessageType
    const text = removeConsoleStyles(message.text())

    log('[%s] %s', type, text)

    messages.set(type, (messages.get(type) || []).concat(text))
  })

  return messages
}
