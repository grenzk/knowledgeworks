import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getRuntimeIcon } from './runtime-icon.js'

const WINDOWS_TITLE_BAR_OVERLAY_HEIGHT = 35

/**
 * @param {BrowserWindow | undefined} window
 * @returns {BrowserWindow | undefined}
 */
function focusWindow(window) {
  if (!window || window.isDestroyed()) {
    return undefined
  }

  if (window.isMinimized()) {
    window.restore()
  }

  window.show()
  window.focus()

  return window
}

/**
 * @param {{
 *   devServerUrl?: string,
 *   electronDirectory: string,
 * }} options
 * @returns {Promise<BrowserWindow>}
 */
export async function createToolbarBrowserWindow({ devServerUrl, electronDirectory }) {
  const toolbarWindow = new BrowserWindow({
    width: 530,
    height: 116,
    minWidth: 520,
    minHeight: 108,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'MediaBridge',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(electronDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (process.platform === 'darwin') {
    toolbarWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    })
  }

  if (devServerUrl) {
    await toolbarWindow.loadURL(devServerUrl)
  } else {
    await toolbarWindow.loadFile(join(electronDirectory, '../dist/renderer/index.html'))
  }

  return toolbarWindow
}

/**
 * @param {{
 *   devServerUrl?: string,
 *   electronDirectory: string,
 *   existingWindow?: BrowserWindow,
 *   onClosed: (closedWindow: BrowserWindow) => void,
 * }} options
 * @returns {Promise<BrowserWindow>}
 */
export async function createLogsBrowserWindow({ devServerUrl, electronDirectory, existingWindow, onClosed }) {
  const focusedWindow = focusWindow(existingWindow)

  if (focusedWindow) {
    return focusedWindow
  }

  const logsWindow = new BrowserWindow({
    width: 760,
    height: 460,
    minWidth: 560,
    minHeight: 340,
    title: 'KnowledgeWorks Logs',
    backgroundColor: '#101617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 11 } }
      : {
          titleBarOverlay: {
            color: '#101617',
            symbolColor: '#f4f2ec',
            height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT,
          },
        }),
    webPreferences: {
      preload: join(electronDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  logsWindow.once('closed', () => onClosed(logsWindow))

  if (devServerUrl) {
    await logsWindow.loadURL(`${devServerUrl}?view=logs`)
  } else {
    await logsWindow.loadFile(join(electronDirectory, '../dist/renderer/index.html'), {
      query: { view: 'logs' },
    })
  }

  return logsWindow
}

/**
 * @param {{
 *   devServerUrl?: string,
 *   electronDirectory: string,
 *   existingWindow?: BrowserWindow,
 *   onClosed: (closedWindow: BrowserWindow) => void,
 * }} options
 * @returns {Promise<BrowserWindow>}
 */
export async function createArticleFlowBrowserWindow({ devServerUrl, electronDirectory, existingWindow, onClosed }) {
  const focusedWindow = focusWindow(existingWindow)

  if (focusedWindow) {
    return focusedWindow
  }

  const articleFlowWindow = new BrowserWindow({
    width: 560,
    height: 560,
    minWidth: 560,
    minHeight: 500,
    alwaysOnTop: true,
    title: 'ArticleFlow',
    backgroundColor: '#202426',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 11 } }
      : {
          titleBarOverlay: {
            color: '#101617',
            symbolColor: '#f4f2ec',
            height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT,
          },
        }),
    webPreferences: {
      preload: join(electronDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  articleFlowWindow.once('closed', () => onClosed(articleFlowWindow))

  if (devServerUrl) {
    await articleFlowWindow.loadURL(`${devServerUrl}?view=article-flow`)
  } else {
    await articleFlowWindow.loadFile(join(electronDirectory, '../dist/renderer/index.html'), {
      query: { view: 'article-flow' },
    })
  }

  return articleFlowWindow
}

/**
 * @param {{
 *   devServerUrl?: string,
 *   electronDirectory: string,
 *   existingWindow?: BrowserWindow,
 *   onClosed: (closedWindow: BrowserWindow) => void,
 * }} options
 * @returns {Promise<BrowserWindow>}
 */
export async function createDocSweepBrowserWindow({
  appRoot,
  devServerUrl,
  electronDirectory,
  existingWindow,
  onClosed,
}) {
  const focusedWindow = focusWindow(existingWindow)

  if (focusedWindow) {
    return focusedWindow
  }

  const docSweepWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 1100,
    minHeight: 850,
    title: 'DocSweep',
    backgroundColor: '#202426',
    icon: getRuntimeIcon(appRoot),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 11 } }
      : {
          titleBarOverlay: {
            color: '#101617',
            symbolColor: '#f4f2ec',
            height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT,
          },
        }),
    webPreferences: {
      preload: join(electronDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  docSweepWindow.once('closed', () => onClosed(docSweepWindow))

  if (devServerUrl) {
    await docSweepWindow.loadURL(`${devServerUrl}?view=docsweep`)
  } else {
    await docSweepWindow.loadFile(join(electronDirectory, '../dist/renderer/index.html'), {
      query: { view: 'docsweep' },
    })
  }

  return docSweepWindow
}

/**
 * @param {{
 *   appRoot: string,
 *   devServerUrl?: string,
 *   electronDirectory: string,
 *   existingWindow?: BrowserWindow,
 *   onClosed: (closedWindow: BrowserWindow) => void,
 * }} options
 * @returns {Promise<BrowserWindow>}
 */
export async function createHubBrowserWindow({ devServerUrl, electronDirectory, existingWindow, onClosed }) {
  const focusedWindow = focusWindow(existingWindow)

  if (focusedWindow) {
    return focusedWindow
  }

  const hubWindow = new BrowserWindow({
    width: 560,
    height: 420,
    minWidth: 520,
    minHeight: 400,
    resizable: false,
    title: 'KnowledgeWorks',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 11 } }
      : {
          titleBarOverlay: {
            color: '#101617',
            symbolColor: '#f4f2ec',
            height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT,
          },
        }),
    backgroundColor: '#202426',
    webPreferences: {
      preload: join(electronDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  hubWindow.once('closed', () => onClosed(hubWindow))

  if (devServerUrl) {
    await hubWindow.loadURL(`${devServerUrl}?view=hub`)
  } else {
    await hubWindow.loadFile(join(electronDirectory, '../dist/renderer/index.html'), {
      query: { view: 'hub' },
    })
  }

  return hubWindow
}
