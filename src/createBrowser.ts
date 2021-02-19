import { until } from '@open-draft/until'
import { ChromiumBrowser, LaunchOptions, chromium } from 'playwright'
import { createLogger } from './internal/createLogger'
import { ServerOptions, PreviewServer } from './server/PreviewServer'

const log = createLogger('browser')

export let browser: ChromiumBrowser
export let server: PreviewServer

export interface CreateBrowserApi {
  browser: ChromiumBrowser
  cleanup(): Promise<void>
}

export interface CreateBrowserOptions {
  launchOptions?: LaunchOptions
  serverOptions?: ServerOptions
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
  log('spawning a server...')

  server = new PreviewServer(options.serverOptions)
  const [serverError, connection] = await until(() => server.listen())

  if (serverError) {
    throw new Error(`Failed to create a server.\n${serverError}`)
  }

  log('successfully spawned the server!', connection.url)

  async function cleanup() {
    log('cleaning up...')
    return Promise.all([browser.close(), server.close()]).then(() => {
      log('successfully cleaned up all resources!')
    })
  }

  process.on('exit', cleanup)
  process.on('SIGKILL', cleanup)

  return {
    browser,
    cleanup,
  }
}
