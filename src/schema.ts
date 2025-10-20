import n3 from 'n3'
import type { Schema, ShapeDecl, shapeExpr as ShapeExpr, Shape, tripleExpr as TripleExpr, NodeConstraint } from 'shexj'

import { ShapeValidator } from './shape'
import { notYetImplemented } from './error'
import { validateNodeConstraint, Node } from './node'

export interface IndexedSchema extends Schema {
  _index: {
    shapeExprs: Record<string, ShapeDecl>,
    tripleExprs: Record<string, TripleExpr>,
  }
}

type ValidationCache = Map<ShapeDecl|ShapeExpr, Record<string, boolean>>

export class Validator {
  db: n3.Store
  schema: IndexedSchema
  _cache: ValidationCache

  constructor (schema: IndexedSchema, db: n3.Store) {
    this.schema = schema
    this.db = db

    this._cache = new Map()
  }

  validate (node: string, shapeLabel?: string): boolean {
    const parsedNode = node.startsWith('_:') ? n3.DataFactory.blankNode(node.slice(2)) : n3.DataFactory.namedNode(node)

    return this.validateNode(parsedNode, shapeLabel)
  }

  validateNode (node: Node, shapeLabel?: string): boolean {
    if (this.schema.startActs !== undefined) {
      notYetImplemented('Semantic Actions')
    }
    for (const shape of this.schema.shapes ?? []) {
      if (shape.abstract !== undefined || shape.restricts !== undefined) {
        notYetImplemented('abstract/restricts')
      }
    }

    const shape = shapeLabel ?? this.schema.start

    if (!shape || !this._resolveShapeExpr(shape)) {
      return false
    }

    return this.validateShapeExpr(node, this._resolveShapeExpr(shape))
  }

  validateShapeExpr (node: Node, shape: ShapeExpr|ShapeDecl): boolean {
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

  validateShapeDecl (node: Node, shape: ShapeDecl): boolean {
    if (!this._cache.has(shape)) {
      this._cache.set(shape, {})
    }

    const cache = this._cache.get(shape)!

    if (!(node.id in cache)) {
      cache[node.id] = true // handle recursion
      cache[node.id] = this.validateShapeExpr(node, shape.shapeExpr)
    }

    return cache[node.id]
  }

  validateNodeConstraint (node: Node, constraint: NodeConstraint): boolean {
    if (!this._cache.has(constraint)) {
      this._cache.set(constraint, {})
    }

    const cache = this._cache.get(constraint)!

    if (!(node.id in cache)) {
      if (constraint.semActs !== undefined) {
        notYetImplemented('Semantic Actions')
      }

      cache[node.id] = validateNodeConstraint(node, constraint)
    }

    return cache[node.id]
  }

  validateShape (node: Node, shape: Shape): boolean {
    if (shape.semActs !== undefined) {
      notYetImplemented('Semantic Actions')
    }

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
