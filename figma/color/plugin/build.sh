#!/bin/sh
# Assemble code.js. Figma plugins have no module loader without a bundler, so the
# generated data and the compiled logic are simply concatenated. src/main.ts is
# global-scope TypeScript — no import/export, which SES would reject anyway.
set -e
cd "$(dirname "$0")"
[ -x node_modules/.bin/tsc ] && [ -x node_modules/.bin/eslint ] || { echo 'Toolchain not installed — run: npm install' >&2; exit 1; }
node build-tones.mjs >/dev/null
python3 build-data.py >/dev/null
node_modules/.bin/tsc
node_modules/.bin/eslint src/main.ts src/wada.d.ts
cat src/data.js build/main.js > code.js

# Figma evaluates code.js under SES lockdown, which rejects the WHOLE file if the
# word `import` is followed by optional whitespace and `(` or a comment delimiter —
# even inside a comment or string, and across newlines.
python3 - << 'EOF'
import re, sys
src = open('code.js').read()
m = re.search(r'(?<![.\w])import(\s*(?:\(|/[/*]))', src)
if m:
    line = src.count('\n', 0, m.start()) + 1
    sys.exit('code.js line %d: SES rejects this import-like expression' % line)
EOF

node --check code.js

# ui.html is not built, but its script block must parse and every $('id') must
# resolve to an element in the markup — an orphaned handler throws at init and
# takes down the whole UI.
node - << 'EOF'
const fs = require('fs');
const html = fs.readFileSync('ui.html', 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
new Function(m[1]);
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
const missing = [...m[1].matchAll(/\$\('([^']+)'\)/g)]
  .map(x => x[1]).filter(r => !ids.has(r));
if (missing.length) {
  console.error('ui.html: unresolved $(id): ' + [...new Set(missing)].join(', '));
  process.exit(1);
}
EOF

printf 'code.js  %s bytes\n' "$(wc -c < code.js | tr -d ' ')"
