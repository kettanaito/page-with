import { ChromiumBrowser, LaunchOptions, chromium } from 'playwright'

export let browser: ChromiumBrowser

export interface CreateBrowserApi {
  browser: ChromiumBrowser
  cleanup(): Promise<void>
}

export async function createBrowser(
  options: LaunchOptions = {},
): Promise<CreateBrowserApi> {
  browser = await chromium.launch({
    headless: !process.env.DEBUG,
    devtools: !!process.env.DEBUG,
    args: ['--no-sandbox'],
    ...options,
  })

  async function cleanup() {
    await browser.close()
  }

  process.on('exit', cleanup)
  process.on('SIGKILL', cleanup)

  return {
    browser,
    cleanup,
  }
}
