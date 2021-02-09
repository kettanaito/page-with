import { CreateBrowserApi, createBrowser } from '../src'

let browser: CreateBrowserApi

beforeAll(async () => {
  browser = await createBrowser()
})

afterAll(async () => {
  await browser.cleanup()
})
