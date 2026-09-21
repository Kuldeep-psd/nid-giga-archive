# NID Giga Archive

A community-maintained archive of gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.

Browse by batch, search across subjects and credits, and explore each map with pan, zoom, section navigation and a PDF download. The interface is responsive, keyboard accessible, and available in light and charcoal dark modes. Every map uses one shared page template.

## Run locally

Use **Node.js 22 LTS**. The website has no npm dependencies to install.

```sh
git clone https://github.com/Kuldeep-psd/nid-giga-archive.git
cd nid-giga-archive
npm start
```

Open [localhost:4173](http://127.0.0.1:4173/). The server binds to this computer only. Set `PORT` to use another port.

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
| Framework preset | Other |
| Build command | `npm run build` |
| Output directory | `build` |
| Node.js | 22.x |
| Environment variables | None required |

The build validates the archive and copies the public website. Vercel redirects PDF downloads to the release assets. No database, API key or server process is needed in production. Vercel can create preview deployments for pull requests and deploy `main` after the repository is connected. See [Vercel’s build documentation](https://vercel.com/docs/builds/configure-a-build).

The production URL is assigned by Vercel; the requested project name does not reserve a particular domain.

## Project structure

| Path | Purpose |
| --- | --- |
| `dist/data/archive.json` | Map catalog, searchable metadata, credits and viewer sections |
| `dist/data/downloads.json` | Original PDF URLs, byte sizes and SHA-256 hashes |
| `dist/site-config.js` | Repository link and optional map-submission form URL |
| `dist/project-template.js` | Shared page structure for every gigamap |
| `dist/project.js` | Shared viewer, navigation, loading and retry interactions |
| `dist/app.js` | Archive navigation, filters and routes |
| `dist/archive-search.js` | Browser-side search index and ranking |
| `dist/assets/` | Previews, Deep Zoom tiles, logo, fonts and vendored libraries |
| `templates/gigamap.json` | Starting point for a new catalog entry |
| `sources/` | Reviewed provenance and credit records |
| `scripts/` | Validation, build, asset preparation and development tools |
| `tests/` | Catalog, search, template and server regression tests |

`dist` is the editable website source. `build` is generated for deployment. Do not edit generated output.

## Checks

```sh
npm run check
npm test
npm run build
```

GitHub Actions runs these checks for pushes and pull requests. `npm run benchmark` measures search using temporary synthetic entries without changing the catalog. `scripts/preview-scenarios.mjs` provides local fixtures for loading errors, retries and larger collections.

## Search and assets

Search runs entirely in the browser. It matches titles, descriptions, batches, domains, topics, methods and names, plus OCR text where available. It supports prefixes, accent folding and limited typo tolerance. Curated metadata ranks above OCR. Every query term must match, and filters combine with the search query. PDFs are not downloaded or scanned when searching.

URLs retain the query and filters; the browser remembers theme and view preferences. Preview images load lazily, and the viewer fetches only the tiles it needs. Artwork keeps its original aspect ratio and colours. Existing source PDFs are preserved; image submissions receive a PDF with the original artwork and, where available, an invisible OCR text layer. OCR may misread small or decorative lettering, so visible credits are verified separately.

The frontend uses plain HTML, CSS and JavaScript, [OpenSeadragon](https://openseadragon.github.io/) and [MiniSearch](https://lucaong.github.io/minisearch/). Libraries and fonts are self-hosted with their licenses.

## License and credits

The original website code is available under the [MIT License](LICENSE). Gigamap artwork, PDFs, institutional marks and third-party libraries are **not** relicensed under MIT. See [CONTENT_RIGHTS.md](CONTENT_RIGHTS.md) for scope and credit corrections.

This is a contributor-led documentation project. Use of the National Institute of Design name and mark identifies the source of the work and does not imply institutional endorsement.
