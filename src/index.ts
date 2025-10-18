import { promises as fs } from 'fs'
import n3 from 'n3'
import shexParser from '@shexjs/parser'
import shapeMap from 'shape-map'
import type { Quad } from 'n3'

import { notYetImplemented } from './error'
import { Validator, IndexedSchema } from './schema'
import { resolveShapeMap, ShapeMap } from './shapeMap'

export { Validator, resolveShapeMap }

export async function loadSchema (filename: string, base: string): Promise<IndexedSchema> {
  const file = await fs.readFile(filename, 'utf8')
  const schema = shexParser.construct(base, {}, { index: true }).parse(file) as IndexedSchema

  if (schema.imports) {
    notYetImplemented('schema imports')
  }

  return schema
}

export async function loadData (filename: string, base: string, format: string = 'N-Quads'): Promise<n3.Store> {
  const file = await fs.readFile(filename, 'utf8')
  return new Promise(function (resolve, reject) {
    const parser = new n3.Parser({ baseIRI: base, format })
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

interface LinkedDataContext {
  base: string,
  prefixes: Record<string, string>
}

export async function loadShapeMap (filename: string, base: string, schemaContext: LinkedDataContext, dataContext: LinkedDataContext): Promise<ShapeMap> {
  const file = await fs.readFile(filename, 'utf8')
  const parser = shapeMap.Parser.construct(base, schemaContext, dataContext)
  return parser.parse(file)
}
