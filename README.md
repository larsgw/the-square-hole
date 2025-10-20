# The Square Hole

> Can you guess where this shape goes? That's right! It goes in the square hole!

Prototype; work in progress. Only returns Boolean pass/fail; debugging happens through logging to stdout/stderr. Uses [shex.js](https://github.com/shexjs/shex.js) to parse ShExC and ShapeMaps, and [n3.js](https://github.com/rdfjs/N3.js) to parse RDF files.

## Usage

Exact API subject to change. Example usage:

```js
import { loadSchema, loadData, Validator } from 'the-square-hole'

const schema = await loadSchema('/file/path/to/schema...')
const data = await loadData('/file/path/to/data...', 'N-Triples')
const validator = new Validator(schema, data)

validator.validate('http://example.org/subject-1', 'http://example.org/shape-1') // true/false
```

### CLI

    NAME

      tsh-validate - validate data against a ShEX schema

    SYNOPSIS

      tsh-validate -x <ShExC> -d <N3> -m <ShapeMap> [-b]
      tsh-validate -x <ShExC> -d <N3> -n <IRI> [-s <Shape>])

    OPTIONS

      -x, --schema-file            Path to ShExC file
      -d, --data-file              Path to N-Triples file
      -m, --shape-map-file         Path to ShapeMap file
      -n, --node                   IRI of node to validate
      -s, --shape                  IRI of shape to validate against (omit to validate against START)

      -b, --bail                   Exit after the first ShapeMap entry fails to validate
      --debug                      Show additional info

      -h, --help                   Display this guidance

## Not yet implemented

**Major:**

  - Functional solution/error reporting

**Features:**

Schemas:
  - Schemas that import other schemas
  - Semantic actions
  - (Annotations)

Shapes:
  - Shapes that `EXTENDS` other shapes
  - `ABSTRACT` shapes
  - `EXTERNAL` shapes
  - Shapes with `restricts` (found in shex.js; not in spec?)
  - `EachOf` or `OneOf` triple sets with `min` and/or `max` (a bit of a problem, to be honest)

Nodes:
  - Configuration of RegExp engine

Optimization:
  - Implement alternative methods of solving the Boolean expression of a `Shape`; switch between implementations depending on heuristics
  - Possibly: try evaluating Boolean expression for early exits (comes with significant overhead)
  - Possibly:
  - Evaluate implementations for simple optimization gains
