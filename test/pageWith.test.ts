import { scenario } from 'src/index'

test('opens a browser with the given usage example', async () => {
  const { page } = await scenario({
    usage: 'test/fixtures/hello.js',
  })

  const bodyText = await page.textContent('body')

  expect(bodyText).toBe('hello')
})

test('opens the same scenario when opening a new page', async () => {
  const { newPage } = await scenario({
    usage: 'test/fixtures/hello.js',
  })
  const page = await newPage()
  const bodyText = await page.textContent('body')

  expect(bodyText).toBe('hello')
})

test('supports multiple independent pages', async () => {
  const firstScenario = await scenario({
    usage: 'test/fixtures/hello.js',
  })
  const secondScenario = await scenario({
    usage: 'test/fixtures/goodbye.js',
  })

  expect(await firstScenario.page.textContent('body')).toBe('hello')
  expect(await secondScenario.page.textContent('body')).toBe('goodbye')
})
