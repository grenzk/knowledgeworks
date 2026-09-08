# KnowledgeWorks

KnowledgeWorks is a desktop automation hub for repeatable eGain content workflows. It provides one controlled browser,
one shared log console, and focused tools for linking content, importing articles, and checking document revisions.

## Included Tools

### MediaBridge

Links prepared content in the eGain article editor to documents, images, and articles. Supported media includes PDF,
Word, Excel, PowerPoint, JPG, PNG, and GIF files. MediaBridge can count linked and unlinked targets before running and
preserves supported source attributes when it restores the article HTML.

### ArticleFlow

Turns a local folder hierarchy into eGain folders and articles. Each `.htm` or `.html` file becomes an article in its
corresponding folder. Imports can check in or publish articles, reuse custom attributes from a prepared template, skip
existing articles, and resume after an interrupted run.

### DocSweep

Reads document control numbers from an Excel workbook, checks enabled document sources for matching revisions, and
writes the collected results back to Excel. Supported sources currently include Vertiv, Asset Library, PD Cloud, and
MASW.

## Using KnowledgeWorks

1. Open KnowledgeWorks.
2. Select **Launch browser** and sign in to the sites required by your workflow.
3. Return to the hub and open MediaBridge, ArticleFlow, or DocSweep.
4. Use the shared log window when an action needs more detail than the tool status bar provides.

KnowledgeWorks keeps its controlled browser profile under the application's user-data directory in `browser-profile`.
The profile persists between launches so authenticated sessions can be reused. Closing KnowledgeWorks does not close
the controlled browser unless `MEDIABRIDGE_CLOSE_BROWSER_ON_EXIT` is set to `1`.

Only one KnowledgeWorks application instance runs at a time. Opening it again focuses the existing hub.

## Tool Requirements

### MediaBridge

Open the eGain article editor and, for document or image linking, the media server in the controlled browser. Select the
required linking mode in MediaBridge before counting or running the automation. Article linking runs entirely in the
eGain editor and uses article IDs prepared in anchor `href` values.

### ArticleFlow

Select the local source folder and the intended destination folder in eGain. ArticleFlow previews the complete source
structure before making changes. The source folder becomes a child of the currently selected eGain folder.

Prepare the template when prompted, configure its custom attributes in eGain, then continue the import. Choose **Check
in** or **Publish** before running. Existing folders are reused and exact existing article titles are skipped, making a
rerun safe after an interruption.

### DocSweep

Select an `.xlsx` workbook with document control numbers in column A, starting at row 2. Open and sign in to each enabled
source site in the controlled browser, then verify the sites before starting the sweep. Results can be saved to the
source workbook or recovered to a new workbook if saving fails.

## Development

### Prerequisites

- Node.js 22.18 or newer
- npm
- Chrome, Edge, or Chromium with remote debugging support

Install dependencies and start the hub in development mode:

```sh
npm install
npm run dev:hub
```

`npm run dev` starts the same application without explicitly requesting the hub window. Use the hub browser button to
start or reconnect to the controlled browser.

Copy `.env.example` to `.env` when a local override is needed. Empty values use the defaults below.

| Variable                                 | Purpose                                                       | Default                     |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------- |
| `MEDIABRIDGE_CDP_PORT`                   | Controlled browser debugging port                             | `9222`                      |
| `MEDIABRIDGE_CHROME_PATH`                | Windows browser executable override                           | Bundled or detected browser |
| `MEDIABRIDGE_CLOSE_BROWSER_ON_EXIT`      | Close a browser launched by KnowledgeWorks when the app exits | Disabled                    |
| `MEDIABRIDGE_BROWSER_STARTUP_TIMEOUT_MS` | Maximum browser startup wait                                  | `30000`                     |

The `MEDIABRIDGE_` prefix is retained for compatibility with existing installations.

## Command-Line Workflows

Run MediaBridge directly with `LINKING_MODE` set to the required mode:

```sh
LINKING_MODE=pdf npm run script:media-linking
```

Preview an ArticleFlow import without changing eGain:

```sh
npm run script:articleflow -- --root "/path/to/Product"
```

Execute the import after selecting the intended eGain parent folder in the controlled browser:

```sh
npm run script:articleflow -- --root "/path/to/Product" --action check-in --execute
```

Use `--action publish` only when every planned article should be published.

## Quality Checks

```sh
npm run format:check
npm run typecheck
npm test
npm run build
```

Use `npm run test:verbose` to display each individual test. Unit tests cover core target classification, linked-state
detection, import planning, and log formatting. Browser-driven eGain workflows still require manual smoke testing
against the controlled browser.

## Desktop Builds

| Command            | Output                                        |
| ------------------ | --------------------------------------------- |
| `npm run package`  | Unpacked application for the current platform |
| `npm run dist:mac` | macOS DMG and ZIP                             |
| `npm run dist:win` | Windows x64 NSIS installer and ZIP            |

Build output is written to `release/`.

Windows production builds bundle Chrome for Testing so enterprise Chrome policies do not block remote debugging. Place
the complete Windows x64 browser in `vendor/chrome-win64/` before packaging; the expected executable is
`vendor/chrome-win64/chrome.exe`. Cross-building the Windows installer on macOS may require Wine, so the official
Windows installer should preferably be built and smoke-tested on Windows.

## Releases and Updates

Packaged Windows builds check the `grenzk/knowledgeworks-releases` GitHub Releases repository for updates. Upload these
artifacts from a Windows build for each release:

- `KnowledgeWorks Setup <version>.exe`
- `KnowledgeWorks Setup <version>.exe.blockmap`
- `latest.yml`

The Windows ZIP is optional. Publish the GitHub Release only after all required updater assets finish uploading. Automatic
updates are currently disabled on macOS.

## Project Structure

```text
electron/              Electron main process, windows, IPC, browser, logs, and updater
src/app/renderer/      KnowledgeWorks hub and shared log console
src/shared/            Shared browser, configuration, cancellation, and type modules
src/tools/articleflow/ ArticleFlow automation, renderer, and command-line entry point
src/tools/mediabridge/ MediaBridge automation, renderer, helpers, and command-line entry point
src/tools/docsweep/    DocSweep automation and renderer
vendor/chrome-win64/   Windows Chrome for Testing bundle used during packaging
```

Architecture decisions and the incremental hub migration are documented in
[KnowledgeWorks Design](docs/KNOWLEDGEWORKS_DESIGN.md). Visual tokens and interaction rules are documented in
[Design System](docs/design-system.md). Release history is maintained in [CHANGELOG.md](CHANGELOG.md).
