import { promises as fs } from 'fs'
import path from 'path'
import n3 from 'n3'
import shexParser from '@shexjs/parser'
import type { Quad } from 'n3'
import type { Schema, ShapeDecl, shapeExpr as ShapeExpr, Shape, tripleExpr as TripleExpr, NodeConstraint } from 'shexj'

import { ShapeValidator } from './shape'
import { notYetImplemented } from './error'
import { validateNodeConstraint, Node } from './node'

interface IndexedSchema extends Schema {
  _index: {
    shapeExprs: Record<string, ShapeDecl>,
    tripleExprs: Record<string, TripleExpr>,
  }
}

type ValidationCache = Map<ShapeDecl|ShapeExpr, Record<string, Boolean>>

export class Validator {
  db: n3.Store
  schema: IndexedSchema
  _cache: ValidationCache

  constructor (schema: IndexedSchema, db: n3.Store) {
    this.schema = schema
    this.db = db

    this._cache = new Map()
  }

  validateNode (node: string, shapeLabel: string): Boolean {
    return this.validateShapeExpr(n3.DataFactory.namedNode(node), this._resolveShapeExpr(shapeLabel))
  }

  validateShapeExpr (node: Node, shape: ShapeExpr|ShapeDecl): Boolean {
    switch (shape.type) {
      case 'ShapeOr': return shape.shapeExprs.some(part => this.validateShapeExpr(node, this._resolveShapeExpr(part)))
      case 'ShapeAnd': return shape.shapeExprs.every(part => this.validateShapeExpr(node, this._resolveShapeExpr(part)))
      case 'ShapeNot': return !this.validateShapeExpr(node, this._resolveShapeExpr(shape.shapeExpr))
      case 'NodeConstraint': return this.validateNodeConstraint(node, shape)
      case 'Shape': return this.validateShape(node, shape)
      case 'ShapeDecl': return this.validateShapeDecl(node, shape)

      case 'ShapeExternal':
        notYetImplemented('shape type ' + shape.type)
    }
  }

  validateShapeDecl (node: Node, shape: ShapeDecl): Boolean {
    if (!this._cache.has(shape)) {
      this._cache.set(shape, {})
    }

    const cache = this._cache.get(shape)!

    if (!(node.id in cache)) {
      if (shape.abstract !== undefined || shape.restricts !== undefined) {
        notYetImplemented('abstract/restricts')
      }
      cache[node.id] = this.validateShapeExpr(node, shape.shapeExpr)
    }

    return cache[node.id]
  }

  validateNodeConstraint (node: Node, constraint: NodeConstraint): Boolean {
    if (!this._cache.has(constraint)) {
      this._cache.set(constraint, {})
    }

    const cache = this._cache.get(constraint)!

    if (!(node.id in cache)) {
      cache[node.id] = validateNodeConstraint(node, constraint)
    }

    return cache[node.id]
  }

  validateShape (node: Node, shape: Shape): Boolean {
    const shapeValidator = new ShapeValidator(node, shape, this)
    return shapeValidator.validate()
  }

  _resolveShapeExpr (expression: ShapeExpr|string): ShapeExpr|ShapeDecl {
    return typeof expression === 'string' ? this.schema._index.shapeExprs[expression] : expression
  }

  _resolveTripleExpr (expression: TripleExpr|string): TripleExpr {
    return typeof expression === 'string' ? this.schema._index.tripleExprs[expression] : expression
  }
}

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
