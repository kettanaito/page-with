import * as path from 'path'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import typescript from 'rollup-plugin-typescript2'
import packageJson from './package.json'

const plugins = [
  json(),
  resolve({
    browser: false,
    preferBuiltins: true,
    mainFields: ['module', 'main', 'jsnext:main'],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  }),
  typescript({
    // Emit declarations in the specified directory
    // instead of next to each individual built target.
    useTsconfigDeclarationDir: true,
  }),
  commonjs(),
]

const buildCjs = {
  input: 'src/index.ts',
  external: Object.keys(packageJson.peerDependencies || {}),
  output: {
    format: 'cjs',
    file: path.resolve(path.dirname(packageJson.types), 'cjs/index.js'),
  },
  plugins,
}

export default [buildCjs]
