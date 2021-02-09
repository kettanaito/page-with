# `page-with`

A library for testing in-browser based usage scenarios of your libraries.

## Motivation

This library empowers example-based testing. That is a testing approach when you write a bunch of actual usage example modules of your own library and wish to run tests against them.

### Why not JSDOM?

JSDOM is designed to emulate browser environment, not substitute it. The code you test in JSDOM still runs in NodeJS and there is no actual browser context involved.

### Why not Cypress?

Tools like Cypress give you a benefit of executing your tests in a real browser. However, the setup of such tools is often verbose and may be an overkill for usage-based in-browser testing of a _library_. Cypress also lacks a low-level browser automation API (i.e. creating and performing actions across multiple tabs, Service Worker access), which makes it not suitable for a versatile yet plain usage testing.

### Why not Puppeteer/Playwrigth/Selenium/etc.?

Low-level browser automation software like Puppeteer gives you a great control over the browser. However, you still need to load your usage example into it, which may involve optional compilation step in case you wish to illustrate usage examples in TypeScript, React, or any other format that cannot run directly in a browser.

## How does this work?

1. Creates a single browser process for the entire test run.
1. Spawns a single server that compiles usage examples on-demand.
1. Gives you an API to compile and load a given usage example as a part of a test.
1. Cleans up afterwards.

## Getting started

### Install

```bash
$ npm install page-with --save-dev
```

### Configure your test framework

Here's an example how to use `page-with` with Jest:

```js
// jest.setup.js
import { createBrowser } from 'page-with'

let browser

beforeAll(async () => {
  browser = await createBrowser()
})

afterAll(async () => {
  await browser.cleanup()
})
```

> Specify the `jest.setup.js` file as the value for the [`setupFilesAfterEnv`](https://jestjs.io/docs/en/configuration.html#setupfilesafterenv-array) option in your Jest configuration file.

### Create a usage scenario

```js
// test/getValue.usage.js
import { getValue } from 'my-library'

// My library hydrates the value by the key from sessionStorage
// if it's present, otherwise it returns undefined.
window.value = getValue('key')
```

> Use [webpack `resolve.alias`](https://webpack.js.org/configuration/resolve/#resolvealias) to import the source code of your library from its published namespace (i.e. `my-library`) instead of relative imports. Let your usage examples look exactly how your library is used.

### Test your library

```js
// test/getValue.test.js
import { pageWith } from 'page-with'

it('hydrates the value from the sessionStorage', async () => {
  const scenario = await pageWith({
    // Provide the usage example we've created earlier.
    example: './getValue.usage.ts',
  })

  const initialValue = await scenario.page.evaluate(() => {
    return window.value
  })
  expect(initialValue).toBeUndefined()

  await scenario.page.evaluate(() => {
    sessionStorage.setItem('key', 'abc-123')
  })
  await scenario.page.reload()

  const hydratedValue = await scenario.page.evaluate(() => {
    return window.value
  })
  expect(hydratedValue).toBe('abc-123')
})
```

## FAQ

### Why choose `playwright`?

Playwright comes with a browser context feature that allows to spawn a single browser instance and execute various scenarios independently without having to create a new browser process per test. This decreases the testing time tremendously.

### Why not `webpack-dev-server`?

Although `webpack-dev-server` can perform webpack compilations and serve static HTML with the compilation assets injected, it needs to know the entry point(s) prior to compilation. To prevent each test from spawning a new dev server, this library creates a single instance of an Express server that compiles given entry points on-demand on runtime.