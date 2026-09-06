KnowledgeWorks Changelog

2.0.0 - September 6, 2026

Added

- Added DocSweep for checking spreadsheet-driven product document lists for updated files.
- Added a dedicated DocSweep launcher to the KnowledgeWorks hub.

Changed

- Aligned the DocSweep window title bar with the KnowledgeWorks and ArticleFlow window design.
- Prepared the stable KnowledgeWorks 2.0.0 release.

2.0.0-beta.1 - August 31, 2026

Added

- Added KnowledgeWorks as the default desktop hub for opening MediaBridge and ArticleFlow.
- Added shared browser controls, connection status, and logging for all KnowledgeWorks tools.
- Added the ArticleFlow desktop workflow for importing filesystem folder structures and HTML articles into the current eGain folder.
- Added ArticleFlow support for creating missing eGain folders, choosing check-in or publish completion, and skipping articles that already exist.
- Added a source structure tree that previews folders, HTML files, and ignored items before an ArticleFlow import runs.
- Added native KnowledgeWorks icons tailored for macOS and Windows.
- Added a project-level Prettier configuration with format and formatting-check commands.
- Added stop controls for MediaBridge target counting and active MediaBridge and ArticleFlow automations without closing the shared browser.
- Added template-backed ArticleFlow imports so articles can reuse custom attributes configured once on a product template.
- Added a Prepare Template and Continue Import workflow for configuring the eGain template before an import begins.
- Added live ArticleFlow source-tree states for folders and articles that are active, created, or failed.
- Added paginated hub navigation for displaying up to four automation tools per page.

Changed

- Updated MediaBridge, ArticleFlow, the KnowledgeWorks hub, and the shared log window to use the Quiet Utility design system.
- Made ArticleFlow a compact resizable workflow window with consistent tool branding and a simplified header.
- Updated package and packaged application metadata from MediaBridge to KnowledgeWorks while preserving the existing update identity.
- Removed the duplicate MediaBridge version badge in favor of the global KnowledgeWorks version shown in the hub.
- Updated the Windows app icon sizing and geometry for better taskbar legibility while retaining macOS-specific icon padding.
- Standardized project formatting with a pinned Prettier development dependency.
- Redesigned the KnowledgeWorks hub as a compact launchpad-style tool grid with tooltips and animated page transitions.
- Updated the ArticleFlow source tree to follow the active import item automatically while preserving completed and failed states.
- Kept the controlled browser above ArticleFlow while the import window is active.
- Temporarily removed the unfinished DocSweep tool from the hub during beta testing.
- Made Prettier line-ending checks consistent across macOS and Windows.
- Added a responsive ArticleFlow workspace that gives the source hierarchy more room on larger windows while preserving the compact stacked layout.

Fixed

- Fixed ArticleFlow folder traversal and selection when eGain collapses, reloads, or replaces folder-tree rows.
- Fixed nested folder creation by reselecting the intended parent before opening its eGain context menu.
- Fixed ArticleFlow article sequencing by waiting for CKEditor rendering and eGain completion before continuing.
- Fixed article creation when eGain delays the New Article dialog or replaces article-list pagination controls.
- Fixed ArticleFlow reruns so existing folders and articles are reused instead of recreated.
- Fixed ArticleFlow editor synchronization and Windows line-ending comparisons before check-in or publication.
- Fixed ArticleFlow publication by confirming the summary dialog after Publish is selected.
- Fixed transparent areas in the macOS and Windows app icons so they no longer render with white backgrounds.
- Removed the MediaBridge window shadow that produced sharp outer corners on Windows.
- Fixed failed ArticleFlow operations leaving the active source item in a permanent loading state.
- Fixed KnowledgeWorks renderer errors exposing full exception details in the hub footer instead of the shared log window.

Refactored

- Organized KnowledgeWorks as a modular monolith with shared platform services and tool-owned modules.
- Migrated the hub, shared log console, MediaBridge, and ArticleFlow renderers to TypeScript incrementally.
- Shared eGain workspace detection and editor locators across automation tools.
- Consolidated redundant tool-specific TypeScript configurations into one strict workspace check.
- Split ArticleFlow folder traversal into focused modules and reused its folder-state cache between operations.

1.2.0 - July 11, 2026

Added

- Added PowerPoint linking support for PPT and PPTX files from the media server.
- Added unlinked filenames and article IDs to the counter log details.
- Added Vitest unit coverage for linking modes, target classification, linked-state detection, and unlinked-target logs.

Changed

- Added standard and verbose test commands with testing guidance in the README.
- Explicitly allowed the required Electron and esbuild installation scripts.
- Updated Vue, Vite, and Concurrently to their latest compatible patch releases.
- Prepared release version 1.2.0.

Fixed

- Updated the transitive form-data dependency to its patched release to address a multipart header injection vulnerability.
- Removed the toolbar shadow that caused sharp outer corners on Windows.

Refactored

- Reorganized the automation workflow into focused modules for target extraction, insertion, restoration, mode handling, and required-page lookup.
- Separated Electron browser management, window creation, auto-update handling, application setup, and IPC registration from the main process entry point.
- Extracted renderer composables for toolbar action state and media-linking behavior.
- Clarified media and article insertion target type definitions.
- Standardized shared count and automation terminology around targets across Electron, preload, and renderer code.

1.1.3 - June 22, 2026

Changed

- Added a shared VS Code launch configuration for debugging the Electron main process.
- Prepared release version 1.1.3.

Fixed

- Prevented duplicate MediaBridge instances and focused the existing toolbar when the app is opened again.

1.1.2 - June 18, 2026

Changed

- Updated target classification to recognize linked documents by mode class, linked images by media URL, and linked articles by the eGain article-link class.
- Prepared release version 1.1.2.

Fixed

- Fixed the Done counter so refreshing displays the number of targets already linked for the selected mode.
- Fixed counter state not resetting before a new refresh.

1.1.1 - June 14, 2026

Changed

- Updated linking logs to list exact missing article IDs and media filenames for skipped targets while keeping toolbar status compact.
- Grouped changelog entries by the versions that shipped them.
- Prepared release version 1.1.1.

Refactored

- Improved automation, renderer, and preload JSDoc types, link target naming, and media server terminology for readability.
- Clarified skipped target logging names and formatter annotations.
- Formatted the codebase with Prettier using single-parameter arrow functions without parentheses.

1.1.0 - June 9, 2026

Added

- Added Article linking mode for resolving eGain article ID placeholders from the article editor.
- Added article placeholder extraction for anchor href values containing ECV3 article IDs.
- Added editor locators for the Link Article toolbar button and Select Link Article modal.

Changed

- Updated linking automation so Article mode runs entirely inside the article editor without requiring the media server page.
- Updated toolbar linking options to include Article.
- Updated linking logs to describe generic targets instead of media-only files.
- Increased the visible Windows app icon artwork size so it better matches other app icons.
- Updated the project description for MediaBridge.
- Prepared release version 1.1.0.

Fixed

- Fixed Article linking dropdown timing by adding a short delay before selecting Article ID.
- Fixed counter label displaying incorrect total link counts.

1.0.2 - June 8, 2026

Changed

- Added an update-ready dialog so users can restart MediaBridge after an update downloads.
- Added a status bar version badge for easier installed-version checks.
- Refined the version badge layout and accessibility label.
- Prepared release version 1.0.2.

1.0.1 - June 7, 2026

Changed

- Added a startup log entry that shows the running MediaBridge version.
- Added GitHub Releases as the update source for packaged builds.
- Added startup update checks with status written to the log console.
- Removed the menu bar on Windows and Linux.
- Simplified the macOS app menu by removing Help and Services.
- Kept only Copy and Select All in the macOS Edit menu for log viewing.
- Prepared release version 1.0.1.

Fixed

- Fixed counter label clipping when Image mode is selected.

1.0.0 - June 6, 2026

Added

- Added native macOS and Windows app icons.

Changed

- Updated the toolbar logo to match the app icon.
- Improved toolbar typography and action alignment.
- Added run mode chevron rotation when the selector is open.
- Refreshed release dependencies.
- Prepared release version 1.0.0.

Fixed

- Fixed source HTML restoration so top-level commented metadata is preserved after linking.
- Preserved source media attributes when restoring linked files.
- Preserved document class names such as drawing and downloadable markers.
- Preserved image style attributes from dummy image tags.

0.3.0 - June 1, 2026

Added

- Added a separate log console window for viewing action details and errors.
- Added toolbar access to open and clear logs.

Changed

- Included the config directory in the project files.
- Prepared release version 0.3.0.

Fixed

- Fixed browser launch reuse so MediaBridge can attach to an already-running CDP browser without opening extra tabs.
- Fixed image linking so inline width and height attributes from dummy image tags are restored after linking.
- Fixed log output for image counts so it shows the actual number of unlinked image targets.

0.2.3 - May 30, 2026

Changed

- Increased the default browser startup wait time to reduce first-launch timing failures.
- Replaced CDP_URL with MEDIABRIDGE_CDP_PORT as the configurable browser connection setting.
- Added shared runtime helpers for deriving the CDP port and default CDP URL.
- Added .env.example listing available MediaBridge environment variables.
- Updated the CLI media-linking script to use the same CDP port behavior as the desktop app.
- Updated documentation to describe MEDIABRIDGE_CDP_PORT usage.
- Prepared release version 0.2.3.

Fixed

- Fixed reconnect behavior so MediaBridge can derive the browser CDP URL from the configured port.
- Fixed browser startup failures caused by Chrome taking longer to expose the remote debugging endpoint.
- Improved the missing article page error by showing which browser tabs MediaBridge can see.

0.2.2 - May 29, 2026

Changed

- Prepared release version 0.2.2.

Fixed

- Fixed source editor updates to avoid filling the entire HTML through Playwright.
- Improved Windows stability when restoring linked files into the article editor.
- Updated the source editor value directly and dispatched input/change events so the article editor recognizes the HTML update without freezing.

0.2.1 / 0.2.0 - May 27, 2026

Added

- Added image media linking support.
- Replaced the disabled Article option with Image.
- Added support for linking JPG, JPEG, PNG, and GIF images from the media library.
- Added image extraction from article editor HTML.
- Added image highlighting in the editor before inserting inline images.
- Added support for inserting media as inline images instead of links when Image mode is selected.
- Added animated busy dots while MediaBridge is counting or running.

Changed

- Updated article link targeting to use anchor elements instead of matching text nodes.
- Improved reliability when articles contain duplicate link text.
- Widened the toolbar counter so longer labels such as Image fit better.
- Updated counter/status behavior for the selected linking mode.
- Prepared release version 0.2.0.
- Prepared release version 0.2.1.

Fixed

- Fixed duplicate text matching issues by targeting article anchors directly.
- Fixed already-linked media targets being included in future linking runs.
- Fixed repeated runs by skipping links and images already pointing to the media service.
- Fixed missing media files stopping the entire process.
- Fixed linking so missing files are skipped and the rest of the files continue processing.
- Fixed the link/image counter resetting when the selected linking mode changes.
