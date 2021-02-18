import * as path from 'path'
import { IFs } from 'memfs'
import { RequestHandler } from 'express'
import { createLogger } from '../internal/createLogger'

const log = createLogger('staticFromMemory')

export function staticFromMemory(ifs: IFs): RequestHandler {
  return (req, res) => {
    const filePath = path.join('dist', req.url)
    log('reading file "%s"...', filePath)

    if (!ifs.existsSync(filePath)) {
      log('asset "%s" not found in memory', filePath)
      return res.status(404).end()
    }

    const stream = ifs.createReadStream(filePath, 'utf8')
    stream.pipe(res)

    stream.on('error', (error) => {
      log('error while reading "%s" from memory', filePath)
      console.error(error)
    })

    stream.on('end', () => {
      log('successfully read the file!', filePath)
      res.end()
    })
  }
}
