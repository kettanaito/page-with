import { pageWith } from 'src/index'

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
