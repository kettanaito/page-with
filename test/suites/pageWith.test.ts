import { pageWith } from 'src/index'

declare namespace window {
  export const string: string
  export const number: number
  export const boolean: boolean
}

test('opens a browser with the given usage example', async () => {
  const { page } = await pageWith({
    example: 'test/fixtures/hello.js',
  })

  const bodyText = await page.textContent('#text')

  expect(bodyText).toBe('hello')
})

test('supports multiple independent pages', async () => {
  const first = await pageWith({
    example: 'test/fixtures/hello.js',
  })

  const second = await pageWith({
    example: 'test/fixtures/goodbye.js',
  })

  expect(await first.page.textContent('#text')).toBe('hello')
  expect(await second.page.textContent('#text')).toBe('goodbye')
})

test('supports per-page routes', async () => {
  const { page, request } = await pageWith({
    example: 'test/fixtures/hello.js',
    routes(app) {
      app.get('/user', (req, res) => {
        res.json({ firstName: 'John' })
      })
    },
  })

  const res = await request('/user')
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ firstName: 'John' })

  // Close the page to remove its routes.
  await page.close()

  const second = await pageWith({
    example: 'test/fixtures/hello.js',
  })
  const secondResponse = await second.request('/user')
  expect(secondResponse.status()).toBe(404)
})

test('supports custom markup', async () => {
  const { page } = await pageWith({
    example: 'test/fixtures/hello.js',
    markup: 'test/fixtures/custom.html',
  })

  const divContent = await page.textContent('#app')
  expect(divContent).toBe('Custom markup')
})

test('supports custom content base for the server', async () => {
  const { request } = await pageWith({
    example: 'test/fixtures/hello.js',
    contentBase: 'test/fixtures',
  })

  const res = await request('/goodbye.js')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/javascript')
})

test('sets the variables from the "env" option on the window', async () => {
  const { page } = await pageWith({
    example: 'test/fixtures/hello.js',
    env: {
      string: 'yes',
      number: 2,
      boolean: true,
    },
  })

  const [string, number, boolean] = await page.evaluate(() => {
    return [window.string, window.number, window.boolean]
  })

  expect(string).toEqual('yes')
  expect(number).toEqual(2)
  expect(boolean).toEqual(true)
})
