import { suite, test } from 'node:test'
import { strict as assert } from 'node:assert'
import path from 'path'
import url from 'url'
import { promises as fs } from 'fs'
import n3 from 'n3'
import { Validator, loadSchema, loadData } from '../lib/index.js'

const ROOT = path.dirname(import.meta.resolve('shex-test').replace(/^file:\/\//, ''))
const VALIDATION_ROOT = path.join(ROOT, 'validation')
const manifest = await fs.readFile(path.join(VALIDATION_ROOT, 'manifest.jsonld')).then(file => JSON.parse(file))

const BASE = manifest['@context'][0]['@base']
const tests = manifest['@graph'][0].entries

function resolveIri (node, base) {
  if (node.startsWith('_:')) {
    return node
  }

  return url.resolve(base, node)
}

function resolveNode (node, base) {
  if (typeof node === 'object') {
    return n3.DataFactory.literal(node['@value'], node['@lang'] ?? (node['@type'] && n3.DataFactory.namedNode(node['@type'])))
  }

  if (node.startsWith('_:')) {
    return n3.DataFactory.blankNode(node.slice(2))
  }

  return n3.DataFactory.namedNode(resolveIri(node, base))
}

suite('shexTest', async () => {
  for (const validationTest of tests) {
    if (validationTest.status !== 'mf:Approved') {
      test.todo(validationTest['@id'])
      continue
    }

    const schemaFile = path.join(VALIDATION_ROOT, validationTest.action.schema)
    const dataFile = path.join(VALIDATION_ROOT, validationTest.action.data)
    const expectedResult = validationTest['@type'] === 'sht:ValidationTest' ? 'conformant' : 'nonconformant'

    await test(validationTest['@id'], async (t) => {
      const shape = validationTest.action.shape && resolveIri(validationTest.action.shape, BASE)
      const focus = resolveNode(validationTest.action.focus, BASE)

      try {
        const schema = await loadSchema(schemaFile, BASE)
        const data = await loadData(dataFile, BASE, 'turtle')
        const validator = new Validator(schema, data)

        const actualResult = validator.validateNode(focus, shape)
        assert.equal(actualResult ? 'conformant' : 'nonconformant', expectedResult)
      } catch (error) {
        if (error.message.startsWith('Not yet implemented')) {
          t.todo(error.message)
        } else {
          console.error('===  SHAPE ===')
          console.error(`<${focus.id}>@<${validationTest.action.shape}>`)
          console.error('=== SCHEMA ===')
          console.error(await fs.readFile(schemaFile, 'utf8'))
          console.error('===  DATA  ===')
          console.error(await fs.readFile(dataFile, 'utf8'))
          throw error
        }
      }
    })
  }
})
