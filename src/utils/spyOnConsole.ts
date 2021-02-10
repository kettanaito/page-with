import { Page } from 'playwright'

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

export function spyOnConsole(page: Page): ConsoleMessages {
  const messages: ConsoleMessages = new Map()

  page.on('console', (message) => {
    const type = message.type() as ConsoleMessageType
    const text = message.text()

    messages.set(type, (messages.get(type) || []).concat(text))
  })

  return messages
}
