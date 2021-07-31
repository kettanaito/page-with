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

export type ConsoleMessagesMap = Map<ConsoleMessageType, string[]>

export type ConsoleMessages = ConsoleMessagesMap &
  Map<'raw', ConsoleMessagesMap>

function removeConsoleStyles(message: string): string {
  return message.replace(/\(*(%s|%c|color:\S+)\)*\s*/g, '').trim()
}

export function spyOnConsole(page: Page): ConsoleMessages {
  const messages: ConsoleMessages = new Map()
  messages.set('raw', new Map())

  log('created a page console spy!')

  page.on('console', (message) => {
    const messageType = message.type() as ConsoleMessageType
    const text = message.text()
    const textWithoutStyles = removeConsoleStyles(message.text())

    log('[%s] %s', messageType, text)

    // Preserve raw console messages.
    const prevRawMessages = messages.get('raw')?.get(messageType) || []
    messages.get('raw')?.set(messageType, prevRawMessages.concat(text))

    // Store formatted console messages (without style positionals).
    const prevMessages = messages.get(messageType) || []
    messages.set(messageType, prevMessages.concat(textWithoutStyles))
  })

  return messages
}
