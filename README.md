# `page-with`

A library for usage example-driven in-browser testing of your own libraries.

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

## Options

### `example`

(_Required_) A relative path to the example module to compile and load in the browser.

```js
pageWith({
  example: path.resolve(__dirname, 'example.js'),
})
```

### `title`

A custom title of the page. Useful to discern pages when loading multiple scenarios in the same browser.

```js
pageWith({
  title: 'My app',
})
```

### `markup`

A custom HTML markup of the loaded example.

```js
pageWith({
  markup: `
<body>
  <button>CLick me</button>
</body>
  `,
})
```

> Note that the compiled example module will be appended to the markup automatically.

You can also provide a relative path to the HTML file to use as the custom markup:

```js
pageWith({
  markup: path.resolve(__dirname, 'markup.html'),
})
```

### `contentBase`

A relative path to a directory to use to resolve page's resources. Useful to load static resources (i.e. images) on the runtime.

```js
pageWith({
  contentBase: path.resolve(__dirname, 'public'),
})
```

### `routes`

A function to customize the Express server instance that runs the local preview of the compiled example.

```js
pageWith({
  routes(app) {
    app.get('/user', (res, res) => {
      res.status(200).json({ firstName: 'John' })
    })
  },
})
```

> Making a `GET /user` request in your example module now returns the defined JSON response.

### `env`

Environmental variables to propagate to the browser's `window`.

```js
pageWith({
  env: {
    serverUrl: 'http://localhost:3000',
  },
})
```

> The `serverUrl` variable will be available under `window.serverUrl` in the browser (and your example).

## Recipes

### Debug mode

Debugging headless automated browsers is not an easy task. That's why `page-with` supports a debug mode in which it will open the browser for you to see and log out all the steps that your test performs into the terminal.

To enable the debug mode pass the `DEBUG` environmental variable to your testing command and scope it down to `pageWith`:

```bash
$ DEBUG=pageWith npm test
```

> If necessary, replace `npm test` with the command that runs your automated tests.

Since you see the same browser instance that runs in your test, you will also see all the steps your test makes live.

### Debug breakpoints

You can use the `debug` utility to create a breakpoint at any point of your test.

```js
import { pageWith, debug } from 'page-with'

it('automates the browser', async () => {
  const { page } = await pageWith({ example: 'function.usage.js' })
  // Pause the execution when the page is created.
  await debug(page)

  await page.evaluate(() => {
    console.log('Hey, some action!')
  })

  // Pause the execution after some actions in the test.
  // See the result of those actions in the opened browser.
  await debug(page)
})
```

> Note that you need to run your test [in debug mode](#debug-mode) to see the automated browser open.

### Custom webpack configuration

This library compiles your usage example in the local server. To extend the webpack configuration used to compile your example pass the partial webpack config to the `serverOptions.webpackConfig` option of `createBrowser`.

```js
import path from 'path'
import { createBrowser } from 'page-with'

const browser = createBrowser({
  serverOptions: {
    webpackConfig: {
      resolve: {
        alias: {
          'my-lib': path.resolve(__dirname, '../lib'),
        },
      },
    },
  },
})
```

## FAQ

### Why choose `playwright`?

Playwright comes with a browser context feature that allows to spawn a single browser instance and execute various scenarios independently without having to create a new browser process per test. This decreases the testing time tremendously.

### Why not `webpack-dev-server`?

Although `webpack-dev-server` can perform webpack compilations and serve static HTML with the compilation assets injected, it needs to know the entry point(s) prior to compilation. To prevent each test from spawning a new dev server, this library creates a single instance of an Express server that compiles given entry points on-demand on runtime.
