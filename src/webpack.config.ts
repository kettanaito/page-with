import * as path from 'path'
import { Configuration } from 'webpack'

export const webpackConfig: Configuration = {
  mode: 'development',
  target: 'web',
  entry: {
    main: 'DEFINED_LATER',
  },
  output: {
    filename: 'main.[chunkhash].js',
  },
  resolve: {
    modules: ['node_modules', path.resolve(process.cwd(), 'node_modules')],
  },
  devtool: false,
}
