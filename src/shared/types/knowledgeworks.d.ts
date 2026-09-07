export type MediaBridgeLinkingMode = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'article'
export type ArticleFlowCompletionAction = 'check-in' | 'publish'
export type KnowledgeWorksLogLevel = 'info' | 'success' | 'error'
export type MediaBridgeLogLevel = KnowledgeWorksLogLevel
export type KnowledgeWorksTool = 'articleflow' | 'mediabridge' | 'docsweep'
export type KnowledgeWorksBrowserState = 'idle' | 'launching' | 'connected' | 'disconnected' | 'error'

export type KnowledgeWorksBrowserStatus = {
  state: KnowledgeWorksBrowserState
  message?: string
}

export type MediaBridgeActionResult = {
  articleUrl?: string
  canceled?: boolean
  linkedTargetCount?: number
  mode?: string
  ok: boolean
  processedCount?: number
  skippedCount?: number
  targetCount?: number
  unlinkedTargetCount?: number
}

export type MediaBridgeOkResult = {
  ok: boolean
}

export type KnowledgeWorksLogEntry = {
  detail?: string
  id: number
  level: KnowledgeWorksLogLevel
  message: string
  scope: string
  timestamp: string
}

export type MediaBridgeLogEntry = KnowledgeWorksLogEntry

export type ArticleFlowImportEntry = {
  folderPath: string[]
  relativeSourcePath: string
  sourcePath: string
  title: string
}

export type ArticleFlowImportPlan = {
  articles: ArticleFlowImportEntry[]
  folderPaths: string[][]
  ignoredPaths: string[]
  rootPath: string
}

export type ArticleFlowSelectionResult = {
  canceled: boolean
  ok: boolean
  plan?: ArticleFlowImportPlan
}

export type ArticleFlowTemplatePreparationResult = {
  canceled: boolean
  ok: boolean
  rootCreated: boolean
  rootName: string
  templateCreated: boolean
  templateTitle: string
}

export type ArticleFlowRunResult = {
  canceled: boolean
  createdArticleCount: number
  createdFolderCount: number
  existingArticleCount: number
  existingFolderCount: number
  failedArticles: Array<{
    message: string
    relativeSourcePath: string
  }>
  ok: boolean
}

export type ArticleFlowProgressUpdate = {
  kind: 'article' | 'folder'
  path: string[]
  status: 'created' | 'existing' | 'failed' | 'started'
}

export type AutomationCancelResult = {
  cancellationRequested: boolean
  ok: boolean
}

export type DocSweepRunResult = {
  ok: boolean
  status: string
}

export type DocSweepFileSelectionResult = {
  canceled: boolean
  ok: boolean
  filePath?: string
}

export type DocSweepActionResult = {
  ok: boolean
}

export type ArticleFlowApi = {
  cancelImport: () => Promise<AutomationCancelResult>
  onImportProgress: (callback: (progress: ArticleFlowProgressUpdate) => void) => () => void
  prepareTemplate: (rootPath: string) => Promise<ArticleFlowTemplatePreparationResult>
  runImport: (rootPath: string, completionAction: ArticleFlowCompletionAction) => Promise<ArticleFlowRunResult>
  selectRoot: () => Promise<ArticleFlowSelectionResult>
}

export type MediaBridgeApi = {
  cancelMediaLinking: () => Promise<AutomationCancelResult>
  cancelTargetCount: () => Promise<AutomationCancelResult>
  clearLogs: () => Promise<MediaBridgeOkResult>
  closeToolbar: () => Promise<void>
  getTargetCount: (mode: MediaBridgeLinkingMode) => Promise<MediaBridgeActionResult>
  getLogs: () => Promise<MediaBridgeLogEntry[]>
  launchBrowser: () => Promise<MediaBridgeActionResult>
  minimizeToolbar: () => Promise<void>
  onLogsUpdated: (callback: (logs: MediaBridgeLogEntry[]) => void) => () => void
  openLogs: () => Promise<MediaBridgeOkResult>
  runMediaLinking: (mode: MediaBridgeLinkingMode) => Promise<MediaBridgeActionResult>
  writeLog: (
    level: MediaBridgeLogLevel,
    scope: string,
    message: string,
    detail?: string,
  ) => Promise<MediaBridgeOkResult>
}

export type DocSweepApi = {
  selectExcelFile: () => Promise<DocSweepFileSelectionResult>
  loadExcel: (filePath: string) => Promise<{
    ok: boolean
    sheetName: string
    documents: Array<{
      row: number
      controlNumber: string
      masw: string
      vertiv: string
      assetLibrary: string
      pdCloud: string
    }>
    error?: string
  }>
  saveExcel: (
    filePath: string,
    documents: Array<{
      row: number
      controlNumber: string
      masw: string
      vertiv: string
      assetLibrary: string
      pdCloud: string
    }>,
    enabledSites: Array<'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'>,
    outputFilePath?: string,
  ) => Promise<{
    ok: boolean
    message?: string
  }>
  saveExcelAs: () => Promise<{
    canceled: boolean
    ok: boolean
    filePath?: string
  }>
  openSite: (url: string, matchUrl: string) => Promise<DocSweepActionResult>
  verifySites: (includedSites: Array<'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'>) => Promise<{
    ok: boolean
    results: Array<{
      name: 'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'
      status: 'Ready' | 'Not connected' | 'Error'
      reason?: string
    }>
    error?: string
  }>
  runSweep: (
    site: 'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW',
    controlNumber: string,
  ) => Promise<{
    ok: boolean
    status: 'Found' | 'Not Found' | 'Error'
    message: string
  }>
}

export type KnowledgeWorksApi = {
  clearLogs: () => Promise<MediaBridgeOkResult>
  getAppVersion: () => Promise<string>
  getBrowserStatus: () => Promise<KnowledgeWorksBrowserStatus>
  getLogs: () => Promise<KnowledgeWorksLogEntry[]>
  launchBrowser: () => Promise<MediaBridgeOkResult>
  onBrowserStatusChanged: (callback: (status: KnowledgeWorksBrowserStatus) => void) => () => void
  onLogsUpdated: (callback: (logs: KnowledgeWorksLogEntry[]) => void) => () => void
  openLogs: () => Promise<MediaBridgeOkResult>
  openTool: (tool: KnowledgeWorksTool) => Promise<MediaBridgeOkResult>
  writeLog: (
    level: KnowledgeWorksLogLevel,
    scope: string,
    message: string,
    detail?: string,
  ) => Promise<MediaBridgeOkResult>
}

declare global {
  interface Window {
    articleflow: ArticleFlowApi
    docsweep: DocSweepApi
    knowledgeworks: KnowledgeWorksApi
    mediabridge: MediaBridgeApi
  }
}

export {}
