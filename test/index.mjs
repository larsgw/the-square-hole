import path from 'node:path'
import process from 'node:process'
import { run } from 'node:test'
import * as reporters from 'node:test/reporters'
import { parseArgs } from 'node:util'
import { Transform } from 'node:stream'

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
    },
    'test-match': {
      type: 'string',
      multiple: true
    },
    'test-skip': {
      type: 'string',
      multiple: true
    }
  }
})

const ac = new AbortController()
const options = {
  files: [path.join(import.meta.dirname, './shex-test.mjs')],
  signal: ac.signal
}

if (args['test-match']) {
  options.testNamePatterns = args['test-match'].map(pattern => new RegExp(pattern))
}
if (args['test-skip']) {
  options.testSkipPatterns = args['test-skip'].map(pattern => new RegExp(pattern))
}

function doesTestRun (name) {
  if (options.testNamePatterns && !options.testNamePatterns.some(pattern => pattern.test(name))) {
    return false
  }

  if (options.testSkipPatterns && options.testSkipPatterns.some(pattern => pattern.test(name))) {
    return false
  }

  return true
}

run(options)
  .on('test:fail', () => {
    if (args.bail) {
      ac.abort()
    }

    process.exitCode = 1
  })
  .compose(new Transform({
    objectMode: true,
    transform (event, encoding, callback) {
      switch (event.type) {
        case 'test:start':
          if (!doesTestRun(event.data.name)) {
            return callback(null, null)
          }
          break
        case 'test:complete':
        case 'test:pass':
        case 'test:fail':
          if (event.data.skip) {
            return callback(null, null)
          }
          break
      }

      callback(null, event)
    },
  }))
  .compose(reporters[args.reporter])
  .pipe(process.stdout)
