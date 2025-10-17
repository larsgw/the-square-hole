import n3 from 'n3'
import type { NamedNode, BlankNode, Literal } from 'n3'
import type { NodeConstraint, valueSetValue as ValueSetValue, LiteralStemRange, IriStemRange, LanguageStemRange } from 'shexj'

export type Node = NamedNode | BlankNode | Literal

const NUMERIC_DATATYPES = [
  'http://www.w3.org/2001/XMLSchema#integer',
  'http://www.w3.org/2001/XMLSchema#decimal',
  'http://www.w3.org/2001/XMLSchema#float',
  'http://www.w3.org/2001/XMLSchema#double',
]

export function validateNodeConstraint (node: Node, shape: NodeConstraint): Boolean {
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
    return shape.values.some(value => validateValueConstraint(node, value))
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

function validateValueConstraint (node: Node, shape: ValueSetValue): Boolean {
  if (typeof shape === 'string') {
    return node.termType === 'NamedNode' && node.value === shape
  } else if ('value' in shape) {
    const literal = n3.DataFactory.literal(shape.value, shape.language ?? (shape.type && n3.DataFactory.namedNode(shape.type)))
    return node.termType === 'Literal' && node.equals(literal)

  } else if (shape.type === 'IriStem') {
    return node.termType === 'NamedNode' && node.value.startsWith(shape.stem)
  } else if (shape.type === 'IriStemRange') {
    return node.termType === 'NamedNode' && validateValueRange(node.value, shape)

  } else if (shape.type === 'LiteralStem') {
    return node.termType === 'Literal' && node.value.startsWith(shape.stem)
  } else if (shape.type === 'LiteralStemRange') {
    return node.termType === 'Literal' && validateValueRange(node.value, shape)

  } else if (shape.type === 'Language') {
    return node.termType === 'Literal' && node.language === shape.languageTag
  } else if (shape.type === 'LanguageStem') {
    return node.termType === 'Literal' && node.language.startsWith(shape.stem)
  } else if (shape.type === 'LanguageStemRange') {
    return node.termType === 'Literal' && validateValueRange(node.language, shape)
  }

  return false
}

function validateValueRange (value: string, shape: LiteralStemRange|IriStemRange|LanguageStemRange): Boolean {
  if (typeof shape.stem === 'string' && !value.startsWith(shape.stem)) {
    return false
  }

  return !shape.exclusions.some(exclusion => typeof exclusion === 'string' ? value === exclusion : value.startsWith(exclusion.stem))
}
