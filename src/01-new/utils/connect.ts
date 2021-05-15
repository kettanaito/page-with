import { AddressInfo } from 'net'
import { Express } from 'express'

export interface ServerConnection {
  port: number
  host: string
  url: string
  close(): Promise<void>
}

export function connect(app: Express): Promise<ServerConnection> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port, address } = server.address() as AddressInfo

      resolve({
        port,
        host: address,
        url: `http://${address}:${port}`,
        close() {
          return new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject()
              }

              resolve()
            })
          })
        },
      })
    })

    server.on('error', reject)
  })
}
