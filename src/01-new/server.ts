import * as express from 'express'
import { connect, ServerConnection } from './utils/connect'
import { ClusterApi, createCluster } from './cluster'
import { makeUrl } from './utils/makeUrl'

interface WoddsApi {
  url: string
  createCluster(options?: ClusterOptions): ClusterApi
  close(): Promise<void>
}

export interface ServerContext {
  app: express.Express
  connection: ServerConnection
  makeUrl(path: string): string
}

export interface ClusterOptions {
  contentBase?: string
}

/**
 * Establish a Webpack server connection.
 */
export async function listen(): Promise<WoddsApi> {
  const app = express()
  const connection = await connect(app)
  const context: ServerContext = {
    app,
    connection,
    makeUrl(path) {
      return makeUrl(path, connection.url)
    },
  }

  return {
    url: connection.url,
    createCluster(options) {
      return createCluster(context, options)
    },
    close() {
      return connection.close()
    },
  }
}
