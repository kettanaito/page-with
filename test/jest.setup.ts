import { CreateBrowserApi, createBrowser } from '../src'

let browser: CreateBrowserApi

beforeAll(async () => {
  // Spawn a browser once, before all tests.
  browser = await createBrowser()
})

afterAll(async () => {
  await browser.cleanup()
})
