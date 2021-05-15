import * as path from 'path'
import fetch from 'node-fetch'
import { listen } from './server'

const FIXTURES_PATH = path.resolve(__dirname, 'fixtures')
const wait = () => new Promise((resolve) => setTimeout(resolve, 900000))

it('creates a welcome path at the cluster root', async () => {
  const server = await listen()
  const cluster = server.createCluster()

  const response = await fetch(cluster.getUrl('/'))

  expect(response.status).toEqual(200)
  expect(await response.text()).toEqual('OK')

  await server.close()
})

it('creates a cluster with a custom content base', async () => {
  const server = await listen()
  const cluster = server.createCluster({
    contentBase: FIXTURES_PATH,
  })

  const fileUrl = cluster.getStaticUrl('file.txt')
  expect(new URL(fileUrl).pathname).toEqual(`/${cluster.id}/static/file.txt`)

  const staticFile = await fetch(fileUrl)
  expect(staticFile.status).toEqual(200)
  expect(await staticFile.text()).toEqual('static file')

  await server.close()
})

it('compiles a given entry module', async () => {
  const server = await listen()
  const cluster = server.createCluster()

  const result = await cluster.compile(path.resolve(__dirname, 'asset.js'))
  const response = await fetch(result.url)

  expect(response.status).toEqual(200)
  expect(await response.text()).toEqual('console.log({firstName:"John"});')

  await server.close()
})
