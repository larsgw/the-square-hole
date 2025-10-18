import path from 'node:path'
import process from 'node:process'
import { run } from 'node:test'
import * as reporters from 'node:test/reporters'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    bail: {
      type: 'boolean',
      short: 'b',
      default: false
    },
    reporter: {
      type: 'string',
      short: 'r',
      default: 'spec'
    }
  }
})

const ac = new AbortController()
run({
  files: [path.join(import.meta.dirname, './shex-test.mjs')],
  signal: ac.signal
})
  .on('test:fail', () => {
    if (args.bail) {
      ac.abort()
    }

    process.exitCode = 1
  })
  .compose(reporters[args.reporter])
  .pipe(process.stdout)
