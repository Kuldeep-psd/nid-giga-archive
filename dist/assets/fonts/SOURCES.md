# Locally hosted typefaces

Downloaded on 2026-09-21 without modifying the font files. Both families use the SIL Open Font License 1.1; their original license texts are included here.

The website keeps its existing typography: DM Sans normal variable weights 400–700, including intermediate weights; IBM Plex Mono normal weights 400 and 500. Latin and Latin Extended subsets are retained. Browser unicode ranges load extended subsets only when needed. Other scripts use the website’s fallback font stack.

## Google Fonts stylesheet

[Original stylesheet request](https://fonts.googleapis.com/css2?family=DM+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&display=swap)

The request used a current Chromium user agent to obtain WOFF2 rather than legacy TTF responses. The Unicode ranges in `/fonts.css` come from that stylesheet.

## Exact files and upstream URLs

- [dm-sans-latin-variable.woff2](https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K6z9mXg.woff2)
- [dm-sans-latin-ext-variable.woff2](https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu6-K6z9mXgjU0.woff2)
- [ibm-plex-mono-latin-400.woff2](https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1i8q131nj-o.woff2)
- [ibm-plex-mono-latin-ext-400.woff2](https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1iEq131nj-otFQ.woff2)
- [ibm-plex-mono-latin-500.woff2](https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwlBFgsAXHNk.woff2)
- [ibm-plex-mono-latin-ext-500.woff2](https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwl5FgsAXHNlYzg.woff2)
- [DM-Sans-OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt)
- [IBM-Plex-Mono-OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt)

## Loading

`/fonts.css` contains local `@font-face` declarations with `font-display: swap`. The primary Latin sans font may be preloaded from `/assets/fonts/dm-sans-latin-variable.woff2` with `as="font" type="font/woff2" crossorigin`. Do not preload every subset: browsers select the required ones.
