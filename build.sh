#!/bin/sh
# Joins the sources in src/ into one self-contained index.html.
#   src/head.html  extra tags for <head>
#   src/page.html  title, fonts, styles, then the page markup
#   src/core.js    watch simulator logic (no DOM)
#   src/ui.js      drawing and controls
set -e
cd "$(dirname "$0")"
split=$(grep -n '^</style>$' src/page.html | head -n 1 | cut -d: -f1)
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' '<meta charset="utf-8">' \
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  cat src/head.html
  sed -n "1,${split}p" src/page.html
  printf '%s\n' '</head>' '<body>'
  sed -n "$((split + 1)),\$p" src/page.html
  printf '<script>\n'; cat src/core.js
  printf '</script>\n<script>\n'; cat src/ui.js
  printf '</script>\n</body>\n</html>\n'
} > index.html
echo "Built index.html ($(wc -c < index.html) bytes)"
