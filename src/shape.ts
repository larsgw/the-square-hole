import type {
  ShapeDecl,
  shapeExpr as ShapeExpr,
  Shape,
  TripleConstraint,
  tripleExpr as TripleExpr
} from 'shexj'
import { notYetImplemented } from './error'
import type { Validator } from './schema'
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

enum Validity {
  TRUE,
  FALSE,
  OPTIONALLY_TRUE
}

export class ShapeValidator {
  node: Node
  shape: Shape
  validator: Validator

  arcsOut: Arc[]
  arcsIn: Arc[]

  itemSlots: Map<Node, BooleanValueSlot[]>
  slotItems: Map<BooleanValueSlot, Node[]>
  mentionedPredicates: Set<string>

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
    this.mentionedPredicates = new Set()

    const expression = this.buildBooleanExpression()

    const extraSlots: Record<string, BooleanValueSlot> = {}
    const extra = new Set(this.shape.extra)

    for (const [predicate, item] of this.arcsOut) {
      if (!this.itemSlots.has(item)) {
        this.itemSlots.set(item, [])
      }

      // Add extra slots (unused in expression itself)
      if ((this.shape.closed !== true && !this.mentionedPredicates.has(predicate.id)) || extra.has(predicate.id)) {
        if (!extraSlots[predicate.id]) {
          extraSlots[predicate.id] = <BooleanValueSlot>{
            type: 'Slot',
            constraint: {
              type: 'TripleConstraint',
              predicate: predicate.id
            },
            potentialValues: []
          }
          this.slotItems.set(extraSlots[predicate.id], [])
        }

        extraSlots[predicate.id].potentialValues.push(item)
        this.itemSlots.get(item)!.push(extraSlots[predicate.id])
      }
    }

    const choices: Array<[Node, BooleanValueSlot[]]> = []
    let product = 1
    for (const [item, slots] of this.itemSlots.entries()) {
      if (slots.length > 1) {
        product *= slots.length
        choices.push([item, slots])
      } else if (slots.length === 1) {
        this.slotItems.get(slots[0])!.push(item)
      } else {
        return false
      }
    }

    if (product < 1024) {
      return this.tryBooleanExpression(expression, this.slotItems, choices)
    }

    console.debug('complexity:', product)
    notYetImplemented('different strategy needed')
  }

  buildBooleanExpression (shape: ShapeDecl|ShapeExpr|TripleExpr = this.shape): BooleanExpression {
    switch (shape.type) {
      // Descend
      case 'ShapeDecl':
        if (shape.abstract !== undefined || shape.restricts !== undefined) {
          notYetImplemented('ShapeDecl.abstract/restricts')
        }
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
        if (shape.extends !== undefined) {
          notYetImplemented('Shape.extends')
        }
        return shape.expression
          ? this.buildBooleanExpression(this.validator._resolveTripleExpr(shape.expression))
          : { type: 'Value', value: true }
      case 'EachOf':
        if (shape.min !== undefined || shape.max !== undefined) {
          notYetImplemented('EachOf.min/max')
        }
        return {
          type: 'And',
          values: shape.expressions.map(part => this.buildBooleanExpression(this.validator._resolveTripleExpr(part)))
        }
      case 'OneOf':
        if (shape.min !== undefined || shape.max !== undefined) {
          notYetImplemented('OneOf.min/max')
        }
        return {
          type: 'Or',
          values: shape.expressions.map(part => this.buildBooleanExpression(this.validator._resolveTripleExpr(part)))
        }

        // Evaluate immediately
      case 'NodeConstraint':
      case 'ShapeNot':
        return { type: 'Value', value: this.validator.validateShapeExpr(this.node, shape) }
      case 'TripleConstraint': {
        this.mentionedPredicates.add(shape.predicate)

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
      const result = this.evaluateBooleanExpression(expression, slotItems)
      return result === Validity.TRUE || result === Validity.OPTIONALLY_TRUE
    }

    // TODO early exit after trying to evaluate?

    const [item, slots] = items[0]
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

  evaluateBooleanExpression (expression: BooleanExpression, slotItems: Map<BooleanValueSlot, Node[]>): Validity {
    switch (expression.type) {
      case 'And': {
        let optionallyTrue = true
        for (const part of expression.values) {
          const partResult = this.evaluateBooleanExpression(part, slotItems)
          if (partResult === Validity.FALSE) {
            return Validity.FALSE
          } else if (partResult === Validity.TRUE) {
            optionallyTrue = false
          }
        }
        return optionallyTrue ? Validity.OPTIONALLY_TRUE : Validity.TRUE
      }

      case 'Or': {
        let trueCount = 0
        let optionallyTrueCount = 0
        for (const part of expression.values) {
          const partResult = this.evaluateBooleanExpression(part, slotItems)

          if (partResult === Validity.TRUE) {
            trueCount++
          } else if (partResult === Validity.OPTIONALLY_TRUE) {
            optionallyTrueCount++
          }
        }

        if (trueCount > 1) {
          return Validity.FALSE
        } else if (trueCount === 1) {
          return Validity.TRUE
        } else if (optionallyTrueCount > 0) {
          return Validity.OPTIONALLY_TRUE
        } else {
          return Validity.FALSE
        }
      }

      case 'Value': return expression.value ? Validity.OPTIONALLY_TRUE : Validity.FALSE
      case 'Slot': {
        const valueCount = slotItems.get(expression)!.length
        if (!expression.constraint) {
          return valueCount > 0 ? Validity.TRUE : Validity.FALSE
        }

        const { min = 1, max = 1 } = expression.constraint
        const result = valueCount >= min && (max === -1 || valueCount <= max)

        return result ? (valueCount > 0 ? Validity.TRUE : Validity.OPTIONALLY_TRUE) : Validity.FALSE
      }
    }
  }
}
