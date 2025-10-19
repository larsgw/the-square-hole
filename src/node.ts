import n3 from 'n3'
import type { NamedNode, BlankNode, Literal } from 'n3'
import type { NodeConstraint, valueSetValue as ValueSetValue, LiteralStemRange, IriStemRange, LanguageStemRange } from 'shexj'

export type Node = NamedNode | BlankNode | Literal

function parseInteger (value: string): number|null {
  return value.match(/^[+-]?[0-9]+$/) ? parseInt(value) : null
}

function parseDecimal (value: string): number|null {
  return value.match(/^[+-]?(?:[0-9]*\.[0-9]+|[0-9]+)$/) ? parseFloat(value): null
}

function parseDouble (value: string): number|null {
  switch (value) {
    case 'NaN': return NaN
    case 'INF': return Infinity
    case '-INF': return -Infinity
    default: return value.match(/^[+\-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?$/) ? parseFloat(value) : null
  }
}

const XSD = 'http://www.w3.org/2001/XMLSchema#'
const NUMERIC_DATATYPES: Record<string, { parse: (value: string) => number|null, range: [number, number] }> = {
  'http://www.w3.org/2001/XMLSchema#integer': { parse: parseInteger, range: [-Infinity, Infinity] },
  'http://www.w3.org/2001/XMLSchema#decimal': { parse: parseDecimal, range: [-Infinity, Infinity] },
  'http://www.w3.org/2001/XMLSchema#float': { parse: parseDouble, range: [-Infinity, Infinity] },
  'http://www.w3.org/2001/XMLSchema#double': { parse: parseDouble, range: [-Infinity, Infinity] },

  'http://www.w3.org/2001/XMLSchema#nonPositiveInteger': { parse: parseInteger, range: [-Infinity, 0] },
  'http://www.w3.org/2001/XMLSchema#negativeInteger': { parse: parseInteger, range: [-Infinity, -1] },
  'http://www.w3.org/2001/XMLSchema#long': { parse: parseInteger, range: [-9223372036854775808, 9223372036854775807] },
  'http://www.w3.org/2001/XMLSchema#int': { parse: parseInteger, range: [-2147483648, 2147483647] },
  'http://www.w3.org/2001/XMLSchema#short': { parse: parseInteger, range: [-32768, 32767] },
  'http://www.w3.org/2001/XMLSchema#byte': { parse: parseInteger, range: [-128, 127] },
  'http://www.w3.org/2001/XMLSchema#nonNegativeInteger': { parse: parseInteger, range: [0, Infinity] },
  'http://www.w3.org/2001/XMLSchema#unsignedLong': { parse: parseInteger, range: [0, 18446744073709551615] },
  'http://www.w3.org/2001/XMLSchema#unsignedInt': { parse: parseInteger, range: [0, 4294967295] },
  'http://www.w3.org/2001/XMLSchema#unsignedShort': { parse: parseInteger, range: [0, 65535] },
  'http://www.w3.org/2001/XMLSchema#unsignedByte': { parse: parseInteger, range: [0, 255] },
  'http://www.w3.org/2001/XMLSchema#positiveInteger': { parse: parseInteger, range: [1, Infinity] }
}

function parseNumericLiteral (value: string, datatype: string): number|null {
  if (datatype in NUMERIC_DATATYPES) {
    const { parse, range: [min, max] } = NUMERIC_DATATYPES[datatype]
    const number = parse(value)

    if (number === null || isNaN(number) || (number >= min && number <= max)) {
      return number
    }
  }

  return null
}

function validateDatatype (value: string, datatype: string): Boolean {
  if (datatype in NUMERIC_DATATYPES) {
    const number = parseNumericLiteral(value, datatype)
    return number !== null
  } else if (datatype === XSD + 'boolean') {
    return value === 'true' || value === 'false' || value === '1' || value === '0'
  } else if (datatype === XSD + 'dateTime') {
    return /^[+-]?\d{4}-[01]\d-[0-3]\dT[0-5]\d:[0-5]\d:[0-5]\d(\.\d+)?([+-][0-2]\d:[0-5]\d|Z)?$/.test(value)
  } else {
    return true
  }
}

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
  if (shape.datatype && !(isLiteral && node.datatypeString === shape.datatype && validateDatatype(node.value, shape.datatype))) {
    return false
  }

  const numericValue = isLiteral ? parseNumericLiteral(node.value, node.datatypeString) : null
  const isNumeric = isLiteral && node.datatypeString in NUMERIC_DATATYPES && numericValue !== null
  const isDecimal = isNumeric && node.datatypeString !== XSD + 'float' && node.datatypeString !== XSD + 'double'
  if (shape.mininclusive && !(isNumeric && numericValue >= shape.mininclusive)) {
    return false
  }
  if (shape.minexclusive && !(isNumeric && numericValue > shape.minexclusive)) {
    return false
  }
  if (shape.maxinclusive && !(isNumeric && numericValue <= shape.maxinclusive)) {
    return false
  }
  if (shape.maxexclusive && !(isNumeric && numericValue < shape.maxexclusive)) {
    return false
  }
  if (shape.totaldigits && !(isDecimal && numericValue.toString().replace(/^[+-]|\.|e.+$/g, '').length <= shape.totaldigits)) {
    return false
  }
  if (shape.fractiondigits && !(isDecimal && (numericValue.toString().match(/\.(\d*[1-9])/)?.[1]?.length ?? 0) <= shape.fractiondigits)) {
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
    return node.termType === 'Literal' && node.language !== '' && node.language === shape.languageTag
  } else if (shape.type === 'LanguageStem') {
    return node.termType === 'Literal' && node.language !== '' && node.language.startsWith(shape.stem)
  } else if (shape.type === 'LanguageStemRange') {
    return node.termType === 'Literal' && node.language !== '' && validateValueRange(node.language, shape)
  }

  return false
}

function validateValueRange (value: string, shape: LiteralStemRange|IriStemRange|LanguageStemRange): Boolean {
  if (typeof shape.stem === 'string' && !value.startsWith(shape.stem)) {
    return false
  }

  return !shape.exclusions.some(exclusion => typeof exclusion === 'string' ? value === exclusion : value.startsWith(exclusion.stem))
}
