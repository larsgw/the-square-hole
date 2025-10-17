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

    if (!expected.includes(node.termType)) {
      return false
    }
  }

  if (shape.values && !shape.values.some(value => validateValueConstraint(node, value))) {
    return false
  }

  if (shape.length !== undefined && !(node.value.length === shape.length)) {
    return false
  }
  if (shape.minlength !== undefined && !(node.value.length >= shape.minlength)) {
    return false
  }
  if (shape.maxlength !== undefined && !(node.value.length <= shape.maxlength)) {
    return false
  }
  if (shape.pattern !== undefined && !(new RegExp(shape.pattern, shape.flags).test(node.value))) {
    // TODO configure regex engine
    return false
  }

  const isLiteral = node.termType === 'Literal'
  if (shape.datatype && !(isLiteral && node.datatypeString === shape.datatype)) {
    // TODO check casting, validity
    return false
  }

  const isNumeric = isLiteral && NUMERIC_DATATYPES.includes(node.datatypeString)
  if (shape.mininclusive && !(isNumeric && parseFloat(node.value) >= shape.mininclusive)) {
    return false
  }
  if (shape.minexclusive && !(isNumeric && parseFloat(node.value) > shape.minexclusive)) {
    return false
  }
  if (shape.maxinclusive && !(isNumeric && parseFloat(node.value) <= shape.maxinclusive)) {
    return false
  }
  if (shape.maxexclusive && !(isNumeric && parseFloat(node.value) < shape.maxexclusive)) {
    return false
  }
  if (shape.totaldigits && !(isNumeric && parseFloat(node.value).toString().replace(/-|\.|e.+$/g, '').length <= shape.totaldigits)) {
    return false
  }
  if (shape.fractiondigits && !(isNumeric && parseFloat(node.value).toString().replace(/^.+\.|e.+$/g, '').length <= shape.fractiondigits)) {
    return false
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
