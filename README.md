# The Square Hole

> Can you guess where this shape goes? That's right! It goes in the square hole!

Simple Linked Data validation.

Prototype; work in progress. Only returns Boolean pass/fail; debugging happens through logging to stdout/stderr. Uses [shex.js](https://github.com/shexjs/shex.js) to parse ShExC and ShapeMaps, and [n3.js](https://github.com/rdfjs/N3.js) to parse RDF files.

The existing implementations of ShEx that I have tried (shex.js, [rudof](https://rudof-project.github.io/), [jena-shex](https://jena.apache.org/documentation/shex/)) do not perform well for my usecase: a `CLOSED` shape with a number of optional triples (i.e. `?` or `*`). shex.js takes 7 seconds for [record B1](https://purl.org/identification-resources/catalog/B1) and 9 minutes for [record B2](https://purl.org/identification-resources/catalog/B2), **when using an simplified schema** that does not recurse into related entities like authors, publishers, and taxonomic checklists.

This prototypes evaluates all 2000+ records (1.4 million triples) against the full schema in 3 seconds. It leverages the fact that, at least in my data, most if not all triples could only fit a single constraint. This *can* greatly reduce the number of choices that need to be made to find potential partitions of triples that satisfy the Boolean expression. I believe this is equivalent to the behavior prescribed by the specification.

Notably though, non-`CLOSED` shapes or shapes allowing specific `EXTRA` triples make it so some or all triples have an additional option, that of being unused, which greatly increases the number of choices to be made. Proper error reporting (i.e. finding _almost_-solutions) leads to similar additional choices for the algorithm: any triple that cannot be used as part of a solution could be discarded (or their object adjusted so that they do fit existing constraints), and missing triples could be "added" instead of leading to early exits.

## Usage

Exact API subject to change. Example usage:

```js
import { loadSchema, loadData, Validator } from 'the-square-hole'

const schema = await loadSchema('/file/path/to/schema...')
const data = await loadData('/file/path/to/data...', 'N-Triples')
const validator = new Validator(schema, data)

validator.validateNode('http://example.org/subject-1', 'http://example.org/shape-1') // true/false
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
