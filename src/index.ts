import { promises as fs } from 'fs'
import path from 'path'
import n3 from 'n3'
import shexParser from '@shexjs/parser'
import type { Quad } from 'n3'
import type {
  Schema,
  ShapeDecl,
  shapeExpr as ShapeExpr,
  Shape,
  NodeConstraint,
  valueSetValue as ValueSetValue,
  LiteralStemRange,
  IriStemRange,
  LanguageStemRange,
  tripleExpr as TripleExpr
} from 'shexj'
import { ShapeValidator, Node } from './shape'
import { notYetImplemented } from './error'

interface IndexedSchema extends Schema {
  _index: {
    shapeExprs: Record<string, ShapeDecl>,
    tripleExprs: Record<string, TripleExpr>,
  };
}

const NUMERIC_DATATYPES = [
  'http://www.w3.org/2001/XMLSchema#integer',
  'http://www.w3.org/2001/XMLSchema#decimal',
  'http://www.w3.org/2001/XMLSchema#float',
  'http://www.w3.org/2001/XMLSchema#double',
]

export class Validator {
  db: n3.Store
  schema: IndexedSchema

  constructor (schema: IndexedSchema, db: n3.Store) {
    this.schema = schema
    this.db = db
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

      case 'ShapeDecl': {
        // console.debug('BEGIN', shape.id, node.id)
        if (shape.abstract !== undefined || shape.restricts !== undefined) {
          notYetImplemented('abstract/restricts')
        }
        const result = this.validateShapeExpr(node, shape.shapeExpr)
        // console.debug('END  ', shape.id)
        return result
      }

      case 'ShapeExternal':
        notYetImplemented('shape type ' + shape.type)
    }
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

  validateNodeConstraint (node: Node, shape: NodeConstraint): Boolean {
    if (shape.nodeKind) {
      const expected = {
        iri: ['NamedNode'],
        bnode: ['BlankNode'],
        nonliteral: ['NamedNode', 'BlankNode'],
        literal: ['Literal'],
      }[shape.nodeKind]

      return expected.includes(node.termType)
    }

    if (shape.values) {
      return shape.values.some(value => this.validateValueConstraint(node, value))
    }

    const isLiteral = node.termType === 'Literal'
    if (shape.datatype) {
      // TODO check casting, validity
      return isLiteral && node.datatypeString === shape.datatype
    }
    if (shape.length !== undefined) {
      return isLiteral && node.value.length === shape.length
    }
    if (shape.minlength !== undefined) {
      return isLiteral && node.value.length >= shape.minlength
    }
    if (shape.maxlength !== undefined) {
      return isLiteral && node.value.length <= shape.maxlength
    }
    if (shape.pattern !== undefined) {
      // TODO configure regex engine
      return isLiteral && (new RegExp(shape.pattern, shape.flags)).test(node.value)
    }

    const isNumeric = isLiteral && NUMERIC_DATATYPES.includes(node.datatypeString)
    if (shape.mininclusive) {
      return isNumeric && parseFloat(node.value) >= shape.mininclusive
    }
    if (shape.minexclusive) {
      return isNumeric && parseFloat(node.value) > shape.minexclusive
    }
    if (shape.maxinclusive) {
      return isNumeric && parseFloat(node.value) <= shape.maxinclusive
    }
    if (shape.maxexclusive) {
      return isNumeric && parseFloat(node.value) < shape.maxexclusive
    }
    if (shape.totaldigits) {
      return isNumeric && parseFloat(node.value).toString().replace(/-|\.|e.+$/g, '').length <= shape.totaldigits
    }
    if (shape.fractiondigits) {
      return isNumeric && parseFloat(node.value).toString().replace(/^.+\.|e.+$/g, '').length <= shape.fractiondigits
    }

    return true
  }

  validateValueConstraint (node: Node, shape: ValueSetValue): Boolean {
    if (typeof shape === 'string') {
      return node.termType === 'NamedNode' && node.value === shape
    } else if ('value' in shape) {
      const literal = n3.DataFactory.literal(shape.value, shape.language ?? (shape.type && n3.DataFactory.namedNode(shape.type)))
      return node.termType === 'Literal' && node.equals(literal)

    } else if (shape.type === 'IriStem') {
      return node.termType === 'NamedNode' && node.value.startsWith(shape.stem)
    } else if (shape.type === 'IriStemRange') {
      return node.termType === 'NamedNode' && this.validateValueRange(node.value, shape)

    } else if (shape.type === 'LiteralStem') {
      return node.termType === 'Literal' && node.value.startsWith(shape.stem)
    } else if (shape.type === 'LiteralStemRange') {
      return node.termType === 'Literal' && this.validateValueRange(node.value, shape)

    } else if (shape.type === 'Language') {
      return node.termType === 'Literal' && node.language === shape.languageTag
    } else if (shape.type === 'LanguageStem') {
      return node.termType === 'Literal' && node.language.startsWith(shape.stem)
    } else if (shape.type === 'LanguageStemRange') {
      return node.termType === 'Literal' && this.validateValueRange(node.language, shape)
    }

    return false
  }

  validateValueRange (value: string, shape: LiteralStemRange|IriStemRange|LanguageStemRange): Boolean {
    if (typeof shape.stem === 'string' && !value.startsWith(shape.stem)) {
      return false
    }

    return !shape.exclusions.some(exclusion => typeof exclusion === 'string' ? value === exclusion : value.startsWith(exclusion.stem))
  }
}

function getFileUri (filename: string): string {
  return 'file://' + path.resolve(filename)
}

async function loadSchema (filename: string, base?: string): Promise<IndexedSchema> {
  const file = await fs.readFile(filename, 'utf8')

  return shexParser.construct(base ?? getFileUri(filename), {}, { index: true }).parse(file) as IndexedSchema
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
