# GW-M5610U Field Guide

Unofficial interactive guide to the Casio GW-M5610U (module 3495).

Live page: https://etnmc.github.io/etnmc/

This branch (`gh-pages`) holds only the site. It shares no history with `main`.

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
| `index.html` | The built page. Self-contained apart from Google Fonts. |
| `src/page.html` | Title, fonts, styles and markup. |
| `src/head.html` | Extra tags for `<head>` (description, icon). |
| `src/core.js` | Simulator logic. No DOM, so it also runs in Node. |
| `src/ui.js` | Drawing, buttons, panels and demos. |
| `build.sh` | Joins the sources into `index.html`. |
| `test/core.test.js` | Logic tests. |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are. |

## Changing it

```sh
./build.sh                 # rebuild index.html after editing src/
node test/core.test.js     # should end with ALL OK
```

## Disclaimer

Not affiliated with or endorsed by Casio Computer Co., Ltd. Product names are trademarks of their owners.
