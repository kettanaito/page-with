import { Configuration } from 'webpack'
import { debug } from 'debug'
import { ChromiumBrowser, LaunchOptions, chromium } from 'playwright'
import { createServer, ServerApi } from './createServer'

const log = debug('pageWith:browser')

export let browser: ChromiumBrowser
export let server: ServerApi

export interface CreateBrowserApi {
  browser: ChromiumBrowser
  cleanup(): Promise<void>
}

export interface CreateBrowserOptions {
  launchOptions?: LaunchOptions
  webpackConfig?: Configuration
}

export async function createBrowser(
  options: CreateBrowserOptions = {},
): Promise<CreateBrowserApi> {
  log('spwaning a browser...')

  browser = await chromium.launch(
    Object.assign(
      {},
      {
        headless: !process.env.DEBUG,
        devtools: !!process.env.DEBUG,
        args: ['--no-sandbox'],
      },
      options.launchOptions,
    ),
  )

  log('successfully spawned the browser!')
  log('spawning a webpack server...')

  server = await createServer({
    webpackConfig: options.webpackConfig || {},
  })

  log('successfully spawned the webpack server', server.url)

  async function cleanup() {
    log('cleaning up...')
    return Promise.all([browser.close(), server.close()]).then(() => void 0)
  }

  process.on('exit', cleanup)
  process.on('SIGKILL', cleanup)

  return {
    browser,
    cleanup,
  }
}
