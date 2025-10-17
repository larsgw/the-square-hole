import type {
  ShapeDecl,
  shapeExpr as ShapeExpr,
  Shape,
  TripleConstraint,
  tripleExpr as TripleExpr
} from 'shexj'
import { notYetImplemented } from './error'
import type { Validator } from './index'
import type { Node } from './node'

type Arc = [Node, Node]

// Boolean expression
interface BooleanAnd {
  type: 'And';
  values: BooleanExpression[];
}
interface BooleanOr {
  type: 'Or';
  values: BooleanExpression[];
}
interface BooleanValue {
  type: 'Value';
  value: Boolean;
}
interface BooleanValueSlot {
  type: 'Slot';
  constraint: TripleConstraint;
  potentialValues: Node[];
}
type BooleanExpression = BooleanAnd | BooleanOr | BooleanValue | BooleanValueSlot

export class ShapeValidator {
  node: Node
  shape: Shape
  validator: Validator

  arcsOut: Arc[]
  arcsIn: Arc[]

  itemSlots: Map<Node, BooleanValueSlot[]>
  slotItems: Map<BooleanValueSlot, Node[]>

  constructor (node: Node, shape: Shape, validator: Validator) {
    this.node = node
    this.shape = shape
    this.validator = validator

    this.arcsOut = []
    for (const quad of this.validator.db.match(node, null, null)) {
      this.arcsOut.push([quad.predicate as Node, quad.object as Node])
    }

    this.arcsIn = []
    for (const quad of this.validator.db.match(null, null, node)) {
      this.arcsIn.push([quad.predicate as Node, quad.subject as Node])
    }
  }

  validate (): Boolean {
    this.itemSlots = new Map()
    this.slotItems = new Map()

    // TODO closed/extra
    const expression = this.buildBooleanExpression()

    for (const triple of this.arcsOut) {
      if (!this.itemSlots.has(triple[1])) {
        this.itemSlots.set(triple[1], [])
      }
    }

    let product = 1
    for (const slots of this.itemSlots.values()) {
      product *= slots.length
    }

    console.debug('complexity:', product)
    if (product < 1024) {
      return this.tryBooleanExpression(expression, this.slotItems, [...this.itemSlots.entries()])
    }

    notYetImplemented('different strategy needed')
  }

  buildBooleanExpression (shape: ShapeDecl|ShapeExpr|TripleExpr = this.shape): BooleanExpression {
    switch (shape.type) {
      // Descend
      case 'ShapeDecl':
        // TODO abstract/restricts
        return this.buildBooleanExpression(shape.shapeExpr)
      case 'ShapeAnd':
        return {
          type: 'And',
          values: shape.shapeExprs.map(part => this.buildBooleanExpression(this.validator._resolveShapeExpr(part)))
        }
      case 'ShapeOr':
        return {
          type: 'Or',
          values: shape.shapeExprs.map(part => this.buildBooleanExpression(this.validator._resolveShapeExpr(part)))
        }
      case 'Shape':
        // TODO extends
        return shape.expression
        ? this.buildBooleanExpression(this.validator._resolveTripleExpr(shape.expression))
        : { type: 'Value', value: true }
      case 'EachOf':
        // TODO min/max?
        return {
          type: 'And',
          values: shape.expressions.map(part => this.buildBooleanExpression(this.validator._resolveTripleExpr(part)))
        }
      case 'OneOf':
        // TODO min/max?
        return {
          type: 'Or',
          values: shape.expressions.map(part => this.buildBooleanExpression(this.validator._resolveTripleExpr(part)))
        }

        // Evaluate immediately
      case 'NodeConstraint':
      case 'ShapeNot':
        return { type: 'Value', value: this.validator.validateShapeExpr(this.node, shape) }
      case 'TripleConstraint': {
        const slot = <BooleanValueSlot>{ type: 'Slot', constraint: shape, potentialValues: [] }
        this.slotItems.set(slot, [])
        this.addPotentialValues(slot)
        return slot
      }

      case 'ShapeExternal':
        notYetImplemented(shape.type)
    }
  }

  addPotentialValues (slot: BooleanValueSlot): void {
    const { inverse = false, valueExpr } = slot.constraint
    const triples = inverse ? this.arcsIn : this.arcsOut
    for (const [predicate, value] of triples) {
      if (predicate.value !== slot.constraint.predicate) {
        continue
      }

      if (valueExpr && !this.validator.validateShapeExpr(value, this.validator._resolveShapeExpr(valueExpr))) {
        console.debug('mismatch:', predicate.id, value.id, 'as', valueExpr)
        continue
      }

      slot.potentialValues.push(value)

      if (!this.itemSlots.has(value)) {
        this.itemSlots.set(value, [])
      }
      this.itemSlots.get(value)!.push(slot)
    }
  }

  tryBooleanExpression (expression: BooleanExpression, slotItems: Map<BooleanValueSlot, Node[]>, items: Array<[Node, BooleanValueSlot[]]>): Boolean {
    if (items.length === 0) {
      return this.evaluateBooleanExpression(expression, slotItems)
    }

    // TODO early exit after trying to evaluate?

    const [item, slots] = items[0]

    if (slots.length === 0) {
      console.error('unused triple:', this.node.id, this.arcsOut.find(arc => arc[1]===item)![0].id, item.id)
    }

    for (const slot of slots) {
      // TODO don't copy for the last slot (less overhead)
      const newSlotItems = new Map(slotItems)
      newSlotItems.get(slot)!.push(item)
      // TODO early exit for exceeding max

      const result = this.tryBooleanExpression(expression, newSlotItems, items.slice(1))

      if (result) {
        return true
      }
    }

    return false
  }

  evaluateBooleanExpression (expression: BooleanExpression, slotItems: Map<BooleanValueSlot, Node[]>): Boolean {
    switch (expression.type) {
      case 'And': return expression.values.every(part => this.evaluateBooleanExpression(part, slotItems))
      case 'Or': return expression.values.filter(part => this.evaluateBooleanExpression(part, slotItems)).length === 1
      case 'Value': return expression.value
      case 'Slot': {
        const valueCount = slotItems.get(expression)!.length
        if (expression.constraint) {
          const { min = 1, max = 1 } = expression.constraint
          return valueCount >= min && (max === -1 || valueCount <= max)
        } else {
          return valueCount > 0
        }
      }
    }
  }

  /*
  // _pruneBooleanAnd (expression: BooleanAnd): BooleanExpression {
  //   const values = []
  //
  //   for (const value of expression.values) {
  //     if (value.type === 'Value' && !value.value) {
  //       return value
  //     } else if (value.type === 'Value' && value.value) {
  //       continue
  //     } else if (value.type === 'Slot' && value.potentialValues.length === 0) {
  //       continue
  //     }
  //
  //     values.push(value)
  //   }
  //
  //   if (values.length > 1) {
  //     return { type: 'And', values }
  //   } else if (values.length > 0) {
  //     return values[0]
  //   } else {
  //     return { type: 'Value', value: true }
  //   }
  // }
  //
  // _pruneBooleanOr (expression: BooleanOr): BooleanExpression {
  //   const values: BooleanExpression[] = []
  //   let orEmpty = false
  //
  //   for (const value of expression.values) {
  //     if (value.type === 'Value' && !value.value) {
  //       continue
  //     } else if (value.type === 'Value' && value.value) {
  //       orEmpty = true
  //       continue
  //     } else if (value.type === 'Slot' && value.potentialValues.length === 0) {
  //       orEmpty = true
  //       continue
  //     }
  //
  //     values.push(value)
  //   }
  //
  //   if (orEmpty) {
  //     values.push({ type: 'Slot', potentialValues: [] })
  //   }
  //
  //   if (values.length > 1) {
  //     return { type: 'Or', values }
  //   } else if (values.length > 0) {
  //     return values[0]
  //   } else {
  //     return { type: 'Value', value: false }
  //   }
  // }
  */
}
