import { Compiler, Stats } from 'webpack'

export function asyncCompile(compiler: Compiler): Promise<Stats> {
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        return reject(error)
      }

      if (typeof stats === 'undefined') {
        return reject()
      }

      if (stats?.hasErrors()) {
        const statsJson = stats.toJson('errors')
        return reject(statsJson.errors)
      }

      resolve(stats)
    })
  })
}
