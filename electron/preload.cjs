const { contextBridge, ipcRenderer } = require('electron')

/**
 * @typedef {'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'article'} MediaBridgeLinkingMode
 * @typedef {'check-in' | 'publish'} ArticleFlowCompletionAction
 * @typedef {'info' | 'success' | 'error'} KnowledgeWorksLogLevel
 *
 * @typedef {{
 *   articleUrl?: string,
 *   canceled?: boolean,
 *   linkedTargetCount?: number,
 *   mode?: string,
 *   ok: boolean,
 *   processedCount?: number,
 *   skippedCount?: number,
 *   targetCount?: number,
 *   unlinkedTargetCount?: number,
 * }} MediaBridgeActionResult
 *
 * @typedef {{ cancellationRequested: boolean, ok: boolean }} AutomationCancelResult
 * @typedef {{
 *   kind: 'article' | 'folder',
 *   path: string[],
 *   status: 'created' | 'existing' | 'failed' | 'started',
 * }} ArticleFlowProgressUpdate
 *
 * @typedef {{
 *   ok: boolean,
 *   status: string,
 * }} DocSweepRunResult
 *
 * @typedef {{ ok: boolean }} MediaBridgeOkResult
 *
 * @typedef {{
 *   detail?: string,
 *   id: number,
 *   level: KnowledgeWorksLogLevel,
 *   message: string,
 *   scope: string,
 *   timestamp: string,
 * }} KnowledgeWorksLogEntry
 *
 * @typedef {'articleflow' | 'mediabridge' | 'docsweep'} KnowledgeWorksTool
 * @typedef {'idle' | 'launching' | 'connected' | 'disconnected' | 'error'} KnowledgeWorksBrowserState
 *
 * @typedef {{
 *   state: KnowledgeWorksBrowserState,
 *   message?: string,
 * }} KnowledgeWorksBrowserStatus
 *
 * @typedef {{
 *   folderPath: string[],
 *   relativeSourcePath: string,
 *   sourcePath: string,
 *   title: string,
 * }} ArticleFlowImportEntry
 *
 * @typedef {{
 *   articles: ArticleFlowImportEntry[],
 *   folderPaths: string[][],
 *   ignoredPaths: string[],
 *   rootPath: string,
 * }} ArticleFlowImportPlan
 *
 * @typedef {{
 *   articlePaths: string[],
 *   folderPaths: string[][],
 * }} ArticleFlowImportSelection
 *
 * @typedef {{
 *   canceled: boolean,
 *   ok: boolean,
 *   plan?: ArticleFlowImportPlan,
 * }} ArticleFlowSelectionResult
 *
 * @typedef {{
 *   canceled: boolean,
 *   ok: boolean,
 *   rootCreated: boolean,
 *   rootName: string,
 *   templateCreated: boolean,
 *   templateTitle: string,
 * }} ArticleFlowTemplatePreparationResult
 *
 * @typedef {{
 *   canceled: boolean,
 *   createdArticleCount: number,
 *   createdFolderCount: number,
 *   existingArticleCount: number,
 *   existingFolderCount: number,
 *   failedArticles: Array<{ message: string, relativeSourcePath: string }>,
 *   ok: boolean,
 * }} ArticleFlowRunResult
 */

/** @returns {Promise<MediaBridgeOkResult>} */
const clearLogs = () => ipcRenderer.invoke('logs:clear')
/** @returns {Promise<KnowledgeWorksLogEntry[]>} */
const getLogs = () => ipcRenderer.invoke('logs:get')
/** @returns {Promise<MediaBridgeOkResult>} */
const openLogs = () => ipcRenderer.invoke('logs:open')

/**
 * @param {(logs: KnowledgeWorksLogEntry[]) => void} callback
 * @returns {() => void}
 */
function onLogsUpdated(callback) {
  const listener = (_event, logs) => callback(logs)

  ipcRenderer.on('logs:updated', listener)

  return () => ipcRenderer.removeListener('logs:updated', listener)
}

/**
 * @param {KnowledgeWorksLogLevel} level
 * @param {string} scope
 * @param {string} message
 * @param {string} [detail]
 * @returns {Promise<MediaBridgeOkResult>}
 */
const writeLog = (level, scope, message, detail) => ipcRenderer.invoke('logs:write', level, scope, message, detail)

contextBridge.exposeInMainWorld('knowledgeworks', {
  clearLogs,

  /**
   * @returns {Promise<string>}
   */
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  /**
   * @returns {Promise<KnowledgeWorksBrowserStatus>}
   */
  getBrowserStatus: () => ipcRenderer.invoke('browser:get-status'),

  getLogs,

  /**
   * @returns {Promise<MediaBridgeOkResult>}
   */
  launchBrowser: () => ipcRenderer.invoke('browser:launch'),

  /**
   * @param {(status: KnowledgeWorksBrowserStatus) => void} callback
   * @returns {() => void}
   */
  onBrowserStatusChanged: callback => {
    const listener = (_event, status) => callback(status)

    ipcRenderer.on('browser:status-changed', listener)

    return () => ipcRenderer.removeListener('browser:status-changed', listener)
  },

  onLogsUpdated,

  openLogs,

  /**
   * @param {KnowledgeWorksTool} tool
   * @returns {Promise<MediaBridgeOkResult>}
   */
  openTool: tool => ipcRenderer.invoke('app:open-tool', tool),

  writeLog,
})

contextBridge.exposeInMainWorld('articleflow', {
  /** @returns {Promise<AutomationCancelResult>} */
  cancelImport: () => ipcRenderer.invoke('articleflow:cancel'),

  /**
   * @param {(progress: ArticleFlowProgressUpdate) => void} callback
   * @returns {() => void}
   */
  onImportProgress: callback => {
    const listener = (_event, progress) => callback(progress)

    ipcRenderer.on('articleflow:progress', listener)

    return () => ipcRenderer.removeListener('articleflow:progress', listener)
  },

  /**
   * @param {string} rootPath
   * @returns {Promise<ArticleFlowTemplatePreparationResult>}
   */
  prepareTemplate: rootPath => ipcRenderer.invoke('articleflow:prepare-template', rootPath),

  /**
   * @param {string} rootPath
   * @param {ArticleFlowCompletionAction} completionAction
   * @param {ArticleFlowImportSelection} selection
   * @returns {Promise<ArticleFlowRunResult>}
   */
  runImport: (rootPath, completionAction, selection) =>
    ipcRenderer.invoke('articleflow:run', rootPath, completionAction, selection),

  /**
   * @returns {Promise<ArticleFlowSelectionResult>}
   */
  selectRoot: () => ipcRenderer.invoke('articleflow:select-root'),
})

contextBridge.exposeInMainWorld('mediabridge', {
  /** @returns {Promise<AutomationCancelResult>} */
  cancelMediaLinking: () => ipcRenderer.invoke('session:cancel-media-linking'),

  /** @returns {Promise<AutomationCancelResult>} */
  cancelTargetCount: () => ipcRenderer.invoke('session:cancel-target-count'),

  clearLogs,

  /**
   * @returns {Promise<void>}
   */
  closeToolbar: () => ipcRenderer.invoke('toolbar:close'),

  /**
   * @param {MediaBridgeLinkingMode} mode
   * @returns {Promise<MediaBridgeActionResult>}
   */
  getTargetCount: mode => ipcRenderer.invoke('session:get-target-count', mode),

  getLogs,

  /**
   * @returns {Promise<MediaBridgeActionResult>}
   */
  launchBrowser: () => ipcRenderer.invoke('session:launch-browser'),

  /**
   * @returns {Promise<void>}
   */
  minimizeToolbar: () => ipcRenderer.invoke('toolbar:minimize'),

  onLogsUpdated,

  openLogs,

  /**
   * @param {MediaBridgeLinkingMode} mode
   * @returns {Promise<MediaBridgeActionResult>}
   */
  runMediaLinking: mode => ipcRenderer.invoke('session:run-media-linking', mode),

  writeLog,
})

contextBridge.exposeInMainWorld('docsweep', {
  /**
   * @returns {Promise<{
   *   canceled: boolean,
   *   ok: boolean,
   *   filePath?: string,
   * }>}
   */
  selectExcelFile: () => ipcRenderer.invoke('docsweep:select-excel-file'),

  /**
   * @param {string} filePath
   * @param {Array<{
   *   row: number,
   *   controlNumber: string,
   *   masw: string,
   *   vertiv: string,
   *   assetLibrary: string,
   *   pdCloud: string,
   * }>} documents
   * @param {Array<'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'>} enabledSites
   * @param {string} [outputFilePath]
   * @returns {Promise<{
   *   ok: boolean,
   *   message?: string,
   * }>}
   */
  saveExcel: (filePath, documents, enabledSites, outputFilePath) =>
    ipcRenderer.invoke('docsweep:save-excel', filePath, documents, enabledSites, outputFilePath),

  /**
   * @returns {Promise<{
   *   canceled: boolean,
   *   ok: boolean,
   *   filePath?: string,
   * }>}
   */
  saveExcelAs: () => ipcRenderer.invoke('docsweep:save-excel-as'),

  /**
   * @param {string} url
   * @param {string} matchUrl
   * @returns {Promise<{ ok: boolean }>}
   */
  openSite: (url, matchUrl) => ipcRenderer.invoke('docsweep:open-site', url, matchUrl),

  /**
   * @param {string[]} includedSites
   * @returns {Promise<{
   *   ok: boolean
   *   results: Array<{
   *     name: string
   *     status: string
   *     reason?: string
   *   }>
   *   error?: string
   * }>}
   */
  verifySites: includedSites => ipcRenderer.invoke('docsweep:verify-sites', includedSites),

  /**
   * @param {string} filePath
   * @returns {Promise<{
   *   ok: boolean,
   *   sheetName: string,
   *   documents: Array<{
   *     row: number,
   *     controlNumber: string,
   *     masw: string,
   *     vertiv: string,
   *     assetLibrary: string,
   *     pdCloud: string
   *   }>,
   *   error?: string
   * }>}
   */
  loadExcel: filePath => ipcRenderer.invoke('docsweep:load-excel', filePath),

  /**
   * @param {'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'} site
   * @param {string} controlNumber
   * @returns {Promise<DocSweepRunResult>}
   */
  runSweep: (site, controlNumber) => ipcRenderer.invoke('docsweep:run', site, controlNumber),
})
