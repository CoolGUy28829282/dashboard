#!/bin/sh
# Build: bundle src/game.js (needs `npm i three esbuild` somewhere; set NM to that dir) and inline it into one self-contained index.html.
set -e
cd "$(dirname "$0")"
NM="${NM:-$(pwd)}"
( cd "$NM" && npx esbuild "$OLDPWD/src/game.js" --bundle --minify --format=iife --outfile="$OLDPWD/game.js" --log-level=warning )
python3 - <<'PY'
js=open('game.js').read().replace('</script','<\\/script')
t=open('src/template.html').read().replace('__INLINE__',open('src/guard.html').read()+'<script>'+js+'</script>')
open('index.html','w').write(t)
PY
