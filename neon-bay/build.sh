#!/bin/sh
# Bundle src/main.js with esbuild (three must resolve: set NM to a dir containing node_modules/three + esbuild) and inline into one index.html.
set -e
cd "$(dirname "$0")"
NM="${NM:?set NM=/dir/with/node_modules}"
rm -rf "$NM/nb" && mkdir -p "$NM/nb" && cp -r src "$NM/nb/src"
( cd "$NM" && npx esbuild nb/src/main.js --bundle --minify --format=iife --outfile="$OLDPWD/game.js" --log-level=warning )
python3 - <<'PY'
js=open('game.js').read().replace('</script','<\\/script')
t=open('src/template.html').read().replace('__INLINE__',open('src/guard.html').read()+'<script>'+js+'</script>')
open('index.html','w').write(t)
PY
