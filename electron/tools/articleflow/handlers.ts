import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron'
import { basename } from 'node:path'
import { connectToBrowser } from '../../../src/shared/browser/connect-to-browser.ts'
import {
  articleFlowTemplateTitle,
  completeArticleTemplateSetup,
  prepareArticleTemplate,
} from '../../../src/tools/articleflow/automation/article-template.ts'
import { createArticleImportPlan } from '../../../src/tools/articleflow/automation/create-import-plan.ts'
import { findArticleFlowWorkspacePage } from '../../../src/tools/articleflow/automation/find-folder-workspace-page.ts'
import {
  scopeArticleImportPlan,
  type ArticleImportSelection,
} from '../../../src/tools/articleflow/automation/scope-import-plan.ts'
import {
  runArticleImport,
  type ArticleCompletionAction,
  type ArticleImportProgress,
} from '../../../src/tools/articleflow/automation/run-article-import.ts'
import type { ArticleFlowProgressUpdate } from '../../../src/shared/types/knowledgeworks'
import { getErrorDetail, getErrorMessage } from '../../platform/error-format.ts'

type AddLog = (level: 'info' | 'success' | 'error', scope: string, message: string, detail?: string) => void

type BrowserService = {
  getCdpUrl: () => string
}

type ArticleFlowHandlerDependencies = {
  addLog: AddLog
  browserService: BrowserService
}

const selectDirectoryOptions: OpenDialogOptions = {
  buttonLabel: 'Select folder',
  properties: ['openDirectory'],
  title: 'Select ArticleFlow source folder',
}

export function registerArticleFlowHandlers({ addLog, browserService }: ArticleFlowHandlerDependencies) {
  let activeImportController: AbortController | undefined

  ipcMain.handle('articleflow:cancel', () => {
    if (!activeImportController) {
      return { cancellationRequested: false, ok: true }
    }

    activeImportController.abort()
    addLog('info', 'ArticleFlow', 'Stopping ArticleFlow after the current operation.')

    return { cancellationRequested: true, ok: true }
  })

  ipcMain.handle('articleflow:select-root', async (event: IpcMainInvokeEvent) => {
    try {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      const selection = parentWindow
        ? await dialog.showOpenDialog(parentWindow, selectDirectoryOptions)
        : await dialog.showOpenDialog(selectDirectoryOptions)

      if (selection.canceled || !selection.filePaths[0]) {
        return { canceled: true, ok: true }
      }

      const plan = await createArticleImportPlan(selection.filePaths[0])

      addLog(
        'success',
        'ArticleFlow',
        `Prepared ${formatCount(plan.articles.length, 'article')} across ${formatCount(plan.folderPaths.length, 'folder')}.`,
        plan.rootPath,
      )

      return { canceled: false, ok: true, plan }
    } catch (error) {
      addLog('error', 'ArticleFlow', getErrorMessage(error), getErrorDetail(error))
      throw error
    }
  })

  ipcMain.handle('articleflow:prepare-template', async (_event: IpcMainInvokeEvent, rootPath: string) => {
    try {
      if (activeImportController) {
        throw new Error('An ArticleFlow import is already running.')
      }

      validateRootPath(rootPath)

      const plan = await createArticleImportPlan(rootPath)

      addLog('info', 'ArticleFlow', `Preparing the import template for ${basename(plan.rootPath)}.`)

      const session = await connectToBrowser(browserService.getCdpUrl())
      const articlePage = findArticleFlowWorkspacePage(session.pages)
      const result = await prepareArticleTemplate(articlePage, plan)

      addLog(
        'success',
        'ArticleFlow',
        `Opened ${result.templateTitle} for custom attribute setup.`,
        `${result.rootCreated ? 'Created' : 'Reused'} root ${result.rootName}; ${
          result.templateCreated ? 'created' : 'reused'
        } template article.`,
      )

      return { canceled: false, ok: true, ...result }
    } catch (error) {
      addLog('error', 'ArticleFlow', getErrorMessage(error), getErrorDetail(error))
      throw error
    }
  })

  ipcMain.handle(
    'articleflow:run',
    async (
      event: IpcMainInvokeEvent,
      rootPath: string,
      completionAction: ArticleCompletionAction,
      selection: unknown,
    ) => {
      const controller = new AbortController()

      try {
        if (activeImportController) {
          throw new Error('An ArticleFlow import is already running.')
        }

        activeImportController = controller
        validateRunRequest(rootPath, completionAction, selection)

        const plan = await createArticleImportPlan(rootPath)
        const scopedPlan = scopeArticleImportPlan(plan, selection)

        if (scopedPlan.articles.length === 0) {
          throw new Error('Select at least one ArticleFlow article before running the import.')
        }

        addLog(
          'info',
          'ArticleFlow',
          `Importing ${formatCount(scopedPlan.articles.length, 'selected article')} from ${basename(plan.rootPath)}.`,
          `${formatCount(scopedPlan.folderPaths.length, 'folder')} in scope. Completion action: ${completionAction}`,
        )

        const session = await connectToBrowser(browserService.getCdpUrl())
        const articlePage = findArticleFlowWorkspacePage(session.pages)

        const templateSetup = await completeArticleTemplateSetup(articlePage, plan, controller.signal)

        const result = await runArticleImport(articlePage, scopedPlan, completionAction, {
          articleTemplateTitle: articleFlowTemplateTitle,
          onProgress: progress => {
            logProgress(addLog, progress, completionAction)
            sendProgress(event, progress)
          },
          signal: controller.signal,
          sourceTemplateArticleId: templateSetup.templateArticleId,
        })
        const failedArticleCount = result.failedArticles.length
        const createdArticleCount = result.createdArticles.length
        const existingArticleCount = result.existingArticles.length
        const detail = result.failedArticles
          .map(({ article, message }) => `${article.relativeSourcePath}: ${message}`)
          .join('\n')

        if (result.canceled) {
          addLog('info', 'ArticleFlow', `Import stopped after ${formatCount(createdArticleCount, 'article')}.`)
        } else if (failedArticleCount > 0) {
          addLog(
            'error',
            'ArticleFlow',
            formatImportSummary(createdArticleCount, existingArticleCount, failedArticleCount, completionAction),
            detail,
          )
        } else {
          addLog(
            'success',
            'ArticleFlow',
            formatImportSummary(createdArticleCount, existingArticleCount, failedArticleCount, completionAction),
          )
        }

        return {
          canceled: result.canceled,
          createdArticleCount,
          createdFolderCount: result.createdFolderPaths.length,
          existingArticleCount,
          existingFolderCount: result.existingFolderPaths.length,
          failedArticles: result.failedArticles.map(({ article, message }) => ({
            message,
            relativeSourcePath: article.relativeSourcePath,
          })),
          ok: !result.canceled && failedArticleCount === 0,
        }
      } catch (error) {
        addLog('error', 'ArticleFlow', getErrorMessage(error), getErrorDetail(error))
        throw error
      } finally {
        if (activeImportController === controller) {
          activeImportController = undefined
        }
      }
    },
  )
}

function sendProgress(event: IpcMainInvokeEvent, progress: ArticleImportProgress) {
  if (event.sender.isDestroyed()) {
    return
  }

  event.sender.send('articleflow:progress', toProgressUpdate(progress))
}

function toProgressUpdate(progress: ArticleImportProgress): ArticleFlowProgressUpdate {
  if (progress.type === 'folder') {
    return {
      kind: 'folder',
      path: progress.folderPath,
      status: progress.status,
    }
  }

  const filename = progress.article.relativeSourcePath.split(/[\\/]/).filter(Boolean).at(-1)

  return {
    kind: 'article',
    path: [...progress.article.folderPath, filename ?? progress.article.title],
    status: progress.status,
  }
}

function validateRunRequest(
  rootPath: string,
  completionAction: ArticleCompletionAction,
  selection: unknown,
): asserts selection is ArticleImportSelection {
  validateRootPath(rootPath)

  if (completionAction !== 'check-in' && completionAction !== 'publish') {
    throw new Error(`Unsupported ArticleFlow completion action: ${completionAction}`)
  }

  if (!isArticleImportSelection(selection)) {
    throw new Error('The selected ArticleFlow import scope is invalid.')
  }
}

function isArticleImportSelection(value: unknown): value is ArticleImportSelection {
  if (!value || typeof value !== 'object') {
    return false
  }

  const selection = value as Partial<ArticleImportSelection>

  return (
    Array.isArray(selection.articlePaths) &&
    selection.articlePaths.every(path => typeof path === 'string' && path.length > 0) &&
    Array.isArray(selection.folderPaths) &&
    selection.folderPaths.every(
      path =>
        Array.isArray(path) &&
        path.length > 0 &&
        path.every(segment => typeof segment === 'string' && segment.length > 0),
    )
  )
}

function validateRootPath(rootPath: string) {
  if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
    throw new Error('Select an ArticleFlow source folder before running the import.')
  }
}

function logProgress(addLog: AddLog, progress: ArticleImportProgress, completionAction: ArticleCompletionAction) {
  if (progress.type === 'folder') {
    if (progress.status === 'created') {
      addLog('success', 'ArticleFlow', `Created folder ${progress.folderPath.join(' > ')}.`)
    }

    return
  }

  if (progress.status === 'started') {
    addLog('info', 'ArticleFlow', `Importing ${progress.article.title}.`, progress.article.relativeSourcePath)
    return
  }

  if (progress.status === 'created') {
    addLog(
      'success',
      'ArticleFlow',
      `${progress.article.title} ${formatCompletionResult(completionAction)}.`,
      progress.article.relativeSourcePath,
    )
    return
  }

  if (progress.status === 'existing') {
    addLog(
      'info',
      'ArticleFlow',
      `Skipped ${progress.article.title}; an article with that title already exists.`,
      progress.article.relativeSourcePath,
    )
    return
  }

  if (progress.status === 'failed') {
    addLog(
      'error',
      'ArticleFlow',
      `${progress.article.title} failed.`,
      `${progress.article.relativeSourcePath}: ${progress.message}`,
    )
  }
}

function formatCompletionResult(completionAction: ArticleCompletionAction) {
  return completionAction === 'check-in' ? 'checked in' : 'published'
}

function formatImportSummary(
  createdArticleCount: number,
  existingArticleCount: number,
  failedArticleCount: number,
  completionAction: ArticleCompletionAction,
) {
  const parts = [`${formatCount(createdArticleCount, 'article')} ${formatCompletionResult(completionAction)}`]

  if (existingArticleCount > 0) {
    parts.push(`${formatCount(existingArticleCount, 'article')} already existed`)
  }

  if (failedArticleCount > 0) {
    parts.push(`${formatCount(failedArticleCount, 'article')} failed`)
  }

  return `${parts.join('; ')}.`
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
