import n3 from 'n3'
import type { Node } from './node'

interface TriplePattern {
  subject: string|{ term: 'FOCUS' }|null
  predicate: string
  object: string|{ term: 'FOCUS' }|null
}

interface QueryShapeAssociation{
  node: string|TriplePattern
  shape: string|{ term: 'START' }
}

interface FixedShapeAssociation extends QueryShapeAssociation {
  node: string
}

interface ResultShapeAssociation extends FixedShapeAssociation {
  status?: 'conformant' | 'nonconformant'
  reason?: string
  appInfo?: unknown
}

export type QueryShapeMap = QueryShapeAssociation[]
export type FixedShapeMap = FixedShapeAssociation[]
export type ResultShapeMap = ResultShapeAssociation[]

export type ShapeAssociation = ResultShapeAssociation | FixedShapeAssociation | QueryShapeAssociation
export type ShapeMap = ShapeAssociation[]

function resolveTriplePattern (pattern: TriplePattern, db: n3.Store): string[] {
  const focus = typeof pattern.subject === 'object' ? 'subject' : 'object'
  const query = db.match(
    typeof pattern.subject === 'string' ? n3.DataFactory.namedNode(pattern.subject) : null,
    n3.DataFactory.namedNode(pattern.predicate),
    typeof pattern.object === 'string' ? n3.DataFactory.namedNode(pattern.object) : null,
  )

  const values = []
  for (const triple of query) {
    values.push((triple[focus] as Node).id)
  }

  return values
}

export function resolveShapeMap (shape: ShapeMap, db: n3.Store): FixedShapeMap {
  return shape.flatMap(({ node, shape }) => {
    if (typeof node === 'string') {
      return { node, shape }
    }

    return resolveTriplePattern(node, db).map(result => ({ node: result, shape }))
  })
}
