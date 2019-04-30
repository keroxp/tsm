# tsm
TypeScript module transpiler from CommonJS to Pure ESModule top of https://jspm.io

## Installation

**via npm**
```bash
$ npm i @keroxp/tsm
```

**via yarn**
```bash
$ yarn add @keroxp/tsm
```

## Usage

```bash
$ tsm src/**/*.tsx
```

This command do steps as follows:

- globbing files
- replace commonjs style import statement into Native ES Module style imports
- 

from `src/index.tsx`

```tsx
import React from "react"
import ReactDOM from "react-dom"
import {a} from "./other"

const View = ({title}) => (<div>{title}</div>);
render(<View title="Hello tsm" />, document.getElementById("body"));
```

into `src/index.js`

```ts
import React from "https://dev.jspm.io/react
import {a} from "./other.js"
```

### Detailed Usage

```
 USAGE

     tsm [files...]

   ARGUMENTS

     [files...]      glob pattern to transpile      optional

   OPTIONS

     --watch                    watch                  optional      default: false
     --outDir <outDir>          output directory       optional
     --lockFile <lockFile>      package-lock.json      optional

   GLOBAL OPTIONS

     -h, --help         Display help
     -V, --version      Display version
     --no-color         Disable colors
     --quiet            Quiet mode - only displays warn and error messages
     -v, --verbose      Verbose mode - will also output debug messages
```

## License

MIT
