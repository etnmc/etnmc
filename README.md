# GW-M5610U Field Guide

Unofficial interactive guide to the Casio GW-M5610U (module 3495).

Live page: https://etnmc.github.io/etnmc/gw-m5610u/

This branch (`gh-pages`) holds only the site, in the `gw-m5610u/` folder. It shares no history with `main`. The `index.html` at the top level only redirects to that folder.

## What is on the page

- A watch simulator that follows the button logic in Casio's Watch Operation Guide 3495. Press or hold its four buttons, or use the keyboard keys A, B, C and D.
- Ten sections: buttons and modes, radio sync, solar power, light, settings, world time, alarm, stopwatch and timer, care and limits, undocumented test screens, and sources.
- Every statement is tagged by where it came from: the manual, Casio product data, owner reports, unverified, or a simulator assumption.

## Limits

- The watch drawing and its display are an approximation, not a copy of the real watch.
- Radio reception is shortened to nine seconds.
- A few items are reported for earlier modules and are not confirmed for module 3495. They are labelled on the page.

## Files

| Path | Purpose |
| --- | --- |
| `gw-m5610u/index.html` | The built page. Self-contained apart from Google Fonts. |
| `gw-m5610u/src/page.html` | Title, fonts, styles and markup. |
| `gw-m5610u/src/head.html` | Extra tags for `<head>` (description, icon). |
| `gw-m5610u/src/core.js` | Simulator logic. No DOM, so it also runs in Node. |
| `gw-m5610u/src/ui.js` | Drawing, buttons, panels and demos. |
| `gw-m5610u/build.sh` | Joins the sources into `index.html`. |
| `gw-m5610u/test/core.test.js` | Logic tests. |
| `index.html` | Redirect to `gw-m5610u/`. |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are. |

## Changing it

```sh
cd gw-m5610u
./build.sh                 # rebuild index.html after editing src/
node test/core.test.js     # should end with ALL OK
```

## Disclaimer

Not affiliated with or endorsed by Casio Computer Co., Ltd. Product names are trademarks of their owners.
