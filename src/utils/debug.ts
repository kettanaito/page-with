import { Page } from 'playwright'
import { createLogger } from '../internal/createLogger'

declare namespace window {
  export let resume: () => void
}

const log = createLogger('debug')

export function debug(page: Page) {
  log('stopped test execution!')

  return new Promise<void>((resolve) => {
    page.evaluate(() => {
      console.warn(`\
[pageWith] Stopped test execution!
Call "window.resume()" on this page to continue running the test.\
`)
    })

    return page
      .evaluate(() => {
        return new Promise<void>((resolve) => {
          window.resume = resolve
        })
      })
      .then(() => {
        log('resumed test execution!')
        resolve()
      })
  })
}
