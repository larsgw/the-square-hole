import { AssertionError } from 'assert'

export function notYetImplemented (message?: string): never {
  throw new Error('Not yet implemented' + (message ? ': ' + message : ''))
}

export class NodeConstraintError extends AssertionError {
  get message () {
    if (!this.generatedMessage) {
      return super.message
    }

    const message = []

    if (this.expected) {
      message.push(`expected ${this.expected}`)
    }
    if (this.actual) {
      message.push(`got ${this.actual}`)
    }

    return message.join(',')
  }
}
