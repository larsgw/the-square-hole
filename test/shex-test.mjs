import { suite, test } from 'node:test'
import { strict as assert } from 'node:assert'
import path from 'path'
import { promises as fs } from 'fs'
import { Validator, loadSchema, loadData } from '../lib/index.js'

const ROOT = path.dirname(import.meta.resolve('shex-test').replace(/^file:\/\//, ''))
const VALIDATION_ROOT = path.join(ROOT, 'validation')
const manifest = await fs.readFile(path.join(VALIDATION_ROOT, 'manifest.jsonld')).then(file => JSON.parse(file))

const BASE = manifest['@context'][0]['@base']
const tests = manifest['@graph'][0].entries

suite('shexTest', async () => {
  for (const validationTest of tests) {
    const schemaFile = path.join(VALIDATION_ROOT, validationTest.action.schema)
    const dataFile = path.join(VALIDATION_ROOT, validationTest.action.data)
    const expectedResult = validationTest['@type'] === 'sht:ValidationTest' ? 'conformant' : 'nonconformant'

    await test(validationTest['@id'], async (t) => {
      const schema = await loadSchema(schemaFile, path.join(BASE, dataFile))
      const data = await loadData(dataFile, path.join(BASE, dataFile), 'turtle')
      const validator = new Validator(schema, data)

      let actualResult
      try {
        actualResult = validator.validateNode(validationTest.action.focus, validationTest.action.shape)
        assert.equal(actualResult ? 'conformant' : 'nonconformant', expectedResult)
      } catch (error) {
        if (error.message.startsWith('Not yet implemented')) {
          t.todo(error.message)
        } else {
          throw error
        }
      }
    })
  }
})
