# NID Giga Archive

A community-maintained archive of gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.

Browse by batch, search across subjects and credits, and explore each map with pan, zoom, section navigation and a PDF download. The interface is responsive, keyboard accessible, and available in light and charcoal dark modes. Every map uses one shared page template.

## Run locally

Use **Node.js 22 LTS, version 22.22.2 or later**.

```sh
git clone https://github.com/Kuldeep-psd/nid-giga-archive.git
cd nid-giga-archive
npm ci
npm run dev
```

Open [localhost:4173](http://127.0.0.1:4173/). Vite provides the development server and updates the page as you edit. It binds to this computer only. Set `PORT` to use another port. `npm start` also starts the development server.

Original PDFs are distributed as [GitHub Release assets](https://github.com/Kuldeep-psd/nid-giga-archive/releases/tag/archive-assets-v1), keeping large binaries out of the Git history. Downloads work without fetching the PDFs into your checkout. For offline PDF access, run:

```sh
npm run assets:fetch
```

## Contribute

- **Submit a map:** a Google Form will be linked from About once it is available. Until then, use the [map submission issue form](https://github.com/Kuldeep-psd/nid-giga-archive/issues/new?template=map-submission.yml).
- **Correct a credit or detail:** [open a correction](https://github.com/Kuldeep-psd/nid-giga-archive/issues/new?template=correction.yml), with a source where possible.
- **Improve the website:** fork this repository and open a pull request. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for the shared layout rules, map ingestion and checks.

Please keep personal information out of public issues unless the person has agreed to publish it. Contributor contact details are on the website’s About page. The repository and submission-form links are configured in `dist/site-config.js`; set `submissionFormUrl` when the Google Form is ready.

## Deploy on Vercel

[Import this repository into Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKuldeep-psd%2Fnid-giga-archive&project-name=nid-giga-archive&repository-name=nid-giga-archive) and name the project **`nid-giga-archive`**. The checked-in configuration uses:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `build` |
| Node.js | 22.x |
| Environment variables | None required |

The build validates the archive, bundles the React application with Vite, and copies the public assets into `build/`. Vercel serves these static files and redirects PDF downloads to the release assets. Its route rewrites support direct links and refreshes at `/maps/:id` and `/about`. No database, API key or server process is needed in production. Vercel can create preview deployments for pull requests and deploy `main` after the repository is connected. See [Vercel’s build documentation](https://vercel.com/docs/builds/configure-a-build).

The live archive is at [nid-giga-archive.vercel.app](https://nid-giga-archive.vercel.app/).

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Vite entry document and initial theme setup |
| `src/` | React application, shared page components, hooks and route handling |
| `dist/data/archive.json` | Map catalog, searchable metadata, credits and viewer sections |
| `dist/data/downloads.json` | Original PDF URLs, byte sizes and SHA-256 hashes |
| `dist/site-config.js` | Repository link and optional map-submission form URL |
| `src/components/ProjectPage.jsx` | Shared page structure for every gigamap |
| `src/components/MapViewer.jsx` | Shared viewer controls, keyboard navigation and focus handling |
| `src/lib/viewer.js` | OpenSeadragon lifecycle, tile loading and retry behaviour |
| `src/components/AboutPage.jsx` | Archive context, contribution routes and contributor contact |
| `dist/archive-search.js` | Browser-side search index and ranking |
| `dist/assets/` | Previews, Deep Zoom tiles, logo, fonts and vendored libraries |
| `templates/gigamap.json` | Starting point for a new catalog entry |
| `sources/` | Reviewed provenance and credit records |
| `scripts/` | Validation, build, asset preparation and development tools |
| `tests/` | Catalog, search, React page, build and server regression tests |

`src/` contains the editable React application. `dist/` remains the source location for the catalog, shared CSS, configuration, search utilities and public assets; it is not Vite's output folder. `build/` is generated for deployment. Do not edit generated output.

## Checks

```sh
npm run check
npm test
npm run build
```

GitHub Actions installs the locked dependencies and runs these checks for pushes and pull requests. `npm run benchmark` measures search using temporary synthetic entries without changing the catalog. After building, `scripts/preview-scenarios.mjs` provides local fixtures for loading errors, retries and larger collections.

## Search and assets

Search runs entirely in the browser. It matches titles, descriptions, batches, domains, topics, methods and names, plus OCR text where available. It supports prefixes, accent folding and limited typo tolerance. Curated metadata ranks above OCR. Every query term must match, and filters combine with the search query. PDFs are not downloaded or scanned when searching.

URLs retain the query and filters; the browser remembers theme and view preferences. Preview images load lazily, and the viewer fetches only the tiles it needs. Artwork keeps its original aspect ratio and colours. Existing source PDFs are preserved; image submissions receive a PDF with the original artwork and, where available, an invisible OCR text layer. OCR may misread small or decorative lettering, so visible credits are verified separately.

The frontend uses [React](https://react.dev/) for shared components and state, [React Router](https://reactrouter.com/) for navigation, and [Vite](https://vite.dev/) for development and production builds. [MiniSearch](https://lucaong.github.io/minisearch/) powers local search, and [OpenSeadragon](https://openseadragon.github.io/) powers the map viewer. Dependencies, libraries and fonts are served with the site; visitors do not depend on a third-party CDN.

Map pages use `/maps/:id`, and the About page uses `/about`. Existing query and hash links remain supported. Collection filters stay in the URL, with document scroll restoration for Back and reload. The dashboard uses native document scrolling with a pinned frame, not a custom wheel handler.

## License and credits

The original website code is available under the [MIT License](LICENSE). Gigamap artwork, PDFs, institutional marks and third-party libraries are **not** relicensed under MIT. See [CONTENT_RIGHTS.md](CONTENT_RIGHTS.md) for scope and credit corrections.

This is a contributor-led documentation project. Use of the National Institute of Design name and mark identifies the source of the work and does not imply institutional endorsement.
