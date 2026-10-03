#!/bin/sh
# Bundle src/main.js (needs `npm i three esbuild` in a scratch dir) and inline it into a single index.html.
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
js=open('game.js').read().replace('</script','<\\/script')
t=open('src/template.html').read().replace('__INLINE__',open('src/guard.html').read()+'<script>'+js+'</script>')
open('index.html','w').write(t)
PY
