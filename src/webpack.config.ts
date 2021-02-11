import * as path from 'path'
import { Configuration } from 'webpack'

export const webpackConfig: Configuration = {
  mode: 'development',
  target: 'web',
  entry: {
    main: 'DEFINED_LATER',
  },
  output: {
    filename: 'main.js',
  },
  resolve: {
    modules: ['node_modules', path.resolve(process.cwd(), 'node_modules')],
    fallback: {
      os: false,
      tty: false,
      net: false,
      http: false,
      https: false,
      timers: false,
      process: false,
      util: false,
    },
  },
  devtool: false,
}
