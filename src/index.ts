import { promises as fs } from 'fs'
import path from 'path'
import n3 from 'n3'
import shexParser from '@shexjs/parser'
import type { Quad } from 'n3'

import { notYetImplemented } from './error'
import { Validator, IndexedSchema } from './schema'

function getFileUri (filename: string): string {
  return 'file://' + path.resolve(filename)
}

async function loadSchema (filename: string, base?: string): Promise<IndexedSchema> {
  const file = await fs.readFile(filename, 'utf8')
  const schema = shexParser.construct(base ?? getFileUri(filename), {}, { index: true }).parse(file) as IndexedSchema

  if (schema.imports) {
    notYetImplemented('schema imports')
  }

  return schema
}

async function loadData (filename: string, base?: string): Promise<n3.Store> {
  const file = await fs.readFile(filename, 'utf8')
  return new Promise(function (resolve, reject) {
    const parser = new n3.Parser({ baseIRI: base ?? getFileUri(filename), format: 'N-Quads'})
    const db = new n3.Store()
    parser.parse(file, function (error: Error, quad: Quad, _prefixes) {
      if (error) {
        reject(error)
      } else if (quad) {
        db.addQuad(quad)
      } else {
        resolve(db)
      }
    })
  })
}
