#!/usr/bin/env node

import path from 'path'
import util from 'util'
import { loadSchema, loadData, loadShapeMap, resolveShapeMap, Validator } from './index'

const GUIDANCE = `
NAME

  tsh-validate - validate data against a ShEX schema

SYNOPSIS

  tsh-validate -x <ShExC> -d <N3> -m <ShapeMap> [-b]
  tsh-validate -x <ShExC> -d <N3> -n <IRI> [-s <Shape>])

OPTIONS

  -x, --schema-file            Path to ShExC file
  -d, --data-file              Path to N-Triples file
  -m, --shape-map-file         Path to ShapeMap file
  -n, --node                   IRI of node to validate
  -s, --shape                  IRI of shape to validate against (omit to validate against START)

  -b, --bail                   Exit after the first ShapeMap entry fails to validate
  --debug                      Show additional info

  -h, --help                   Display this guidance
`

const { values: args } = util.parseArgs({
  options: {
    'schema-file': {
      short: 'x',
      type: 'string'
    },
    'data-file': {
      short: 'd',
      type: 'string'
    },
    'shape-map-file': {
      short: 'm',
      type: 'string'
    },
    node: {
      short: 'n',
      type: 'string'
    },
    shape: {
      short: 's',
      type: 'string'
    },

    bail: {
      short: 'b',
      type: 'boolean',
      default: false
    },

    debug: {
      type: 'boolean',
      default: false
    },
    help: {
      short: 'h',
      type: 'boolean',
      default: false
    }
  }
})

function getFileUri (filename: string): string {
  return 'file://' + path.resolve(filename)
}

async function timePromise<T>(message: string, promise: Promise<T>): Promise<T> {
  if (!args.debug) {
    return promise
  }

  console.time(message)
  const result = await promise
  console.timeEnd(message)
  return result
}

function formatPair (pair: { node: string, shape: string|{ term: string } }): string {
  // TODO formatting
  return `<${pair.node}>@${typeof pair.shape === 'string' ? `<${pair.shape}>` : pair.shape.term}`
}

async function main () {
  if (args.help) {
    console.log(GUIDANCE)
    process.exit(0)
  } else if (!args['schema-file'] || !args['data-file'] || (!args['shape-map-file'] && !args.node)) {
    console.log(GUIDANCE)
    process.exit(1)
  }

  const schemaPath = path.resolve(args['schema-file'])
  const dataPath = path.resolve(args['data-file'])
  const schemaBase = getFileUri(schemaPath)
  const dataBase = getFileUri(dataPath)

  const [schema, db] = await Promise.all([
    timePromise('load schema', loadSchema(schemaPath, schemaBase)),
    timePromise('load ld', loadData(dataPath, dataBase))
  ])

  let focus
  if (args['shape-map-file']) {
    const shapeMapPath = path.resolve(args['shape-map-file'])
    const shapeMapBase = getFileUri(shapeMapPath)
    const shapeMap = await timePromise('load shapeMap', loadShapeMap(
      shapeMapPath,
      shapeMapBase,
      // TODO get prefixes
      { base: schemaBase, prefixes: {} },
      { base: dataBase, prefixes: {} }
    ))
    focus = await timePromise('resolve shapeMap', (async () => resolveShapeMap(shapeMap, db))())
  } else {
    // TODO prefixes, base
    focus = [{ node: args.node!, shape: args.shape ?? { term: 'START' } }]
  }

  if (args.debug) { console.time('validate') }
  const validator = new Validator(schema, db)
  let result = true
  for (const pair of focus) {
    const shape = typeof pair.shape === 'string' ? pair.shape : undefined
    const conformant = validator.validateNode(pair.node, shape)

    if (!conformant) {
      // TODO formatting
      console.error(formatPair(pair), 'failed')

      result = false

      if (args.bail) {
        break
      }
    } else {
      if (args.debug) {
        console.log(formatPair(pair), 'passed')
      }
    }
  }
  if (args.debug) { console.timeEnd('validate') }

  if (args.debug) {
    console.log('Result:', result ? 'passed' : 'failed')
  }

  process.exitCode = result ? 0 : 1
}

main().catch(console.error)
