import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { Locator, Page } from 'playwright'
import { isAutomationCancellationError, throwIfAutomationCancelled } from '../../../shared/automation/cancellation.ts'
import {
  getArticleEditorLocators,
  getArticleListEntryLocators,
  getArticleListLocators,
  getArticlePageActionLocators,
  getNewArticleDialogLocators,
  getPublishSummaryDialogLocators,
} from '../../../shared/egain/editor/get-article-editor-locators.ts'
import { collectExistingArticleTitles } from './collect-existing-article-titles.ts'
import type { ArticleImportEntry, ArticleImportPlan } from './create-import-plan.ts'
import { ensureArticleEditMode } from './ensure-article-edit-mode.ts'
import { openNewArticleDialogInFolder } from './open-new-article-dialog.ts'
import {
  ensureFolderPath,
  getSelectedFolderReference,
  selectFolderPath,
  type EgainImportParent,
  type FolderTraversalCache,
} from './ensure-folder-path.ts'

const editorSyncTimeoutMs = 30000
const editorSyncPollIntervalMs = 100
const editorDataStableCheckCount = 10
const articleCompletionTimeoutMs = 60000
const articleOpenTimeoutMs = 120000
const articleCompletionSettleDelayMs = 5000
const newArticleDialogSubmitAttempts = 3
const newArticleDialogSubmitTimeoutMs = 10000

type CkEditorInstance = {
  container?: { $?: HTMLElement }
  fire: (eventName: string) => void
  getData: () => string
  mode: string
  setData: (html: string, options: { callback: () => void }) => void
  status: string
  updateElement: () => void
}

type CkEditorWindow = Window & {
  CKEDITOR?: {
    instances?: Record<string, CkEditorInstance>
  }
}

type ArticleEditorState = {
  data: string
  mode: string
  name: string
  status: string
}

export type ArticleCompletionAction = 'check-in' | 'publish'

export type ArticleImportFailure = {
  article: ArticleImportEntry
  message: string
}

export type ArticleImportResult = {
  canceled: boolean
  createdArticles: ArticleImportEntry[]
  createdFolderPaths: string[][]
  existingArticles: ArticleImportEntry[]
  existingFolderPaths: string[][]
  failedArticles: ArticleImportFailure[]
}

export type ArticleImportProgress =
  | {
      article: ArticleImportEntry
      status: 'created' | 'existing' | 'started'
      type: 'article'
    }
  | {
      article: ArticleImportEntry
      message: string
      status: 'failed'
      type: 'article'
    }
  | {
      folderPath: string[]
      status: 'created' | 'existing' | 'failed' | 'started'
      type: 'folder'
    }

export type ArticleImportOptions = {
  articleTemplateTitle?: string
  onProgress?: (progress: ArticleImportProgress) => void
  signal?: AbortSignal
  sourceTemplateArticleId?: string
}

/**
 * Recreates the planned folder hierarchy under the currently selected eGain
 * folder, then creates each missing article sequentially. Existing exact-title
 * matches are skipped, and individual article failures do not end the batch.
 */
export async function runArticleImport(
  articlePage: Page,
  plan: ArticleImportPlan,
  completionAction: ArticleCompletionAction,
  options: ArticleImportOptions = {},
): Promise<ArticleImportResult> {
  const { signal } = options
  const createdArticles: ArticleImportEntry[] = []
  const createdFolderPaths: string[][] = []
  const existingArticles: ArticleImportEntry[] = []
  const existingFolderPaths: string[][] = []
  const failedArticles: ArticleImportFailure[] = []
  const existingTitlesByFolder = new Map<string, Set<string>>()
  const folderTraversalCache: FolderTraversalCache = new Map()
  let importParent: EgainImportParent | undefined
  let rootTemplateMayNeedRestoration = false
  let canceled = false

  try {
    throwIfAutomationCancelled(signal)
    importParent = await getSelectedFolderReference(articlePage, signal)
    const importRootName = options.articleTemplateTitle ? basename(plan.rootPath) : undefined

    if (importRootName && importParent.name !== importRootName) {
      throw new Error(`Expected the selected eGain root to be "${importRootName}", but found "${importParent.name}".`)
    }

    for (const folderPath of plan.folderPaths) {
      throwIfAutomationCancelled(signal)
      options.onProgress?.({ folderPath, status: 'started', type: 'folder' })

      try {
        const destinationFolderPath = getImportDestinationPath(folderPath, importRootName)
        const createdFinalFolder =
          destinationFolderPath.length > 0
            ? await ensureFolderPath(articlePage, importParent, destinationFolderPath, signal, folderTraversalCache)
            : false

        if (createdFinalFolder) {
          createdFolderPaths.push(folderPath)
          options.onProgress?.({ folderPath, status: 'created', type: 'folder' })
        } else {
          existingFolderPaths.push(folderPath)
          options.onProgress?.({ folderPath, status: 'existing', type: 'folder' })
        }
      } catch (error) {
        if (!isAutomationCancellationError(error)) {
          options.onProgress?.({ folderPath, status: 'failed', type: 'folder' })
        }

        throw error
      }
    }

    for (const article of plan.articles) {
      try {
        throwIfAutomationCancelled(signal)
        const destinationFolderPath = getImportDestinationPath(article.folderPath, importRootName)

        await selectFolderPath(articlePage, importParent, destinationFolderPath, signal, folderTraversalCache)

        if (options.sourceTemplateArticleId && destinationFolderPath.length > 0) {
          await waitForSourceTemplateToLeaveArticleList(articlePage, options.sourceTemplateArticleId, signal)
        }

        const folderKey = JSON.stringify(article.folderPath)
        let existingTitles = existingTitlesByFolder.get(folderKey)

        if (!existingTitles) {
          existingTitles = await collectExistingArticleTitles(articlePage, signal)
          existingTitlesByFolder.set(folderKey, existingTitles)
        }

        if (existingTitles.has(article.title)) {
          existingArticles.push(article)
          options.onProgress?.({ article, status: 'existing', type: 'article' })
          continue
        }

        options.onProgress?.({ article, status: 'started', type: 'article' })

        if (options.articleTemplateTitle) {
          rootTemplateMayNeedRestoration ||= destinationFolderPath.length === 0

          await createArticleFromTemplate(
            articlePage,
            article,
            completionAction,
            options.articleTemplateTitle,
            existingTitles.has(options.articleTemplateTitle),
            signal,
          )
          existingTitles.delete(options.articleTemplateTitle)
        } else {
          await createArticle(articlePage, article, completionAction, signal)
        }

        existingTitles.add(article.title)
        createdArticles.push(article)
        options.onProgress?.({ article, status: 'created', type: 'article' })
      } catch (error) {
        if (isAutomationCancellationError(error)) {
          canceled = true
          break
        }

        const message = error instanceof Error ? error.message : String(error)

        failedArticles.push({
          article,
          message,
        })
        options.onProgress?.({ article, message, status: 'failed', type: 'article' })
      }
    }
  } catch (error) {
    if (isAutomationCancellationError(error)) {
      canceled = true
    } else {
      throw error
    }
  }

  if (importParent && rootTemplateMayNeedRestoration && options.articleTemplateTitle) {
    await restoreRootArticleTemplate(articlePage, importParent, options.articleTemplateTitle, folderTraversalCache)
  }

  canceled ||= signal?.aborted ?? false

  return { canceled, createdArticles, createdFolderPaths, existingArticles, existingFolderPaths, failedArticles }
}

/**
 * Converts filesystem paths into paths relative to a pre-created eGain root.
 * Direct-creation imports omit rootName and retain their existing behavior.
 */
export function getImportDestinationPath(folderPath: string[], rootName?: string): string[] {
  if (!rootName) {
    return folderPath
  }

  if (folderPath[0] !== rootName) {
    throw new Error(`Expected the import path to start with "${rootName}": ${folderPath.join(' > ')}`)
  }

  return folderPath.slice(1)
}

async function createArticle(
  articlePage: Page,
  article: ArticleImportEntry,
  completionAction: ArticleCompletionAction,
  signal?: AbortSignal,
) {
  const html = await readArticleHtml(article)
  const destinationFolderName = article.folderPath.at(-1)

  if (!destinationFolderName) {
    throw new Error(`The article has no destination folder: ${article.relativeSourcePath}`)
  }

  const { dialog, doneButton, titleInput } = getNewArticleDialogLocators(articlePage)

  await openNewArticleDialogInFolder(articlePage, destinationFolderName, signal)

  await requireUniqueLocator(titleInput, 'New Article title input')
  await titleInput.fill(article.title)

  await requireUniqueLocator(doneButton, 'New Article Done button')
  await submitNewArticleDialog(articlePage, dialog, doneButton)

  await updateArticleAndComplete(articlePage, article, html, completionAction)
}

async function createArticleFromTemplate(
  articlePage: Page,
  article: ArticleImportEntry,
  completionAction: ArticleCompletionAction,
  templateTitle: string,
  templateCloneExists: boolean,
  signal?: AbortSignal,
) {
  const html = await readArticleHtml(article)

  if (!templateCloneExists) {
    await pasteArticleTemplate(articlePage, templateTitle, signal)
  }

  await openArticleFromList(articlePage, templateTitle)

  await ensureArticleEditMode(articlePage, signal, articleOpenTimeoutMs)

  await updateArticleAndComplete(articlePage, article, html, completionAction)
}

async function updateArticleAndComplete(
  articlePage: Page,
  article: ArticleImportEntry,
  html: string,
  completionAction: ArticleCompletionAction,
) {
  const { saveArticleButton, checkInArticleButton, publishArticleButton } = getArticlePageActionLocators(articlePage)
  const { articleTitleEditButton, articleTitleInput } = getArticleEditorLocators(articlePage)

  await requireUniqueLocator(articleTitleInput, 'article title input')

  if (!(await articleTitleInput.isVisible())) {
    await requireUniqueLocator(articleTitleEditButton, 'article title Edit button')
    await articleTitleEditButton.click()
    await articleTitleInput.waitFor({ state: 'visible', timeout: articleOpenTimeoutMs })
  }

  await articleTitleInput.fill(article.title, { timeout: articleOpenTimeoutMs })
  await waitForInputValue(articlePage, articleTitleInput, article.title, 'created article title')

  const previousEditorState = await waitForReadyArticleEditor(articlePage)

  await setArticleEditorHtml(articlePage, previousEditorState.name, html)
  await waitForStableArticleEditorData(articlePage, previousEditorState.name, previousEditorState.data)

  const completionButton = completionAction === 'publish' ? publishArticleButton : checkInArticleButton
  const completionLabel = completionAction === 'publish' ? 'Publish button' : 'Check-In button'

  await requireUniqueLocator(saveArticleButton, 'Save button')
  await saveArticleButton.waitFor({ state: 'visible', timeout: articleOpenTimeoutMs })
  await saveArticleButton.click()
  await waitForArticleSave(articlePage, completionButton, previousEditorState.name, previousEditorState.data)

  await requireUniqueLocator(completionButton, completionLabel)
  await completionButton.click()

  if (completionAction === 'publish') {
    const { dialog: publishDialog, doneButton: publishDoneButton } = getPublishSummaryDialogLocators(articlePage)

    await requireUniqueLocator(publishDialog, 'Publish summary dialog')
    await requireUniqueLocator(publishDoneButton, 'Publish summary Done button')
    await publishDoneButton.click()
    await publishDialog.waitFor({ state: 'hidden' })
  }

  await waitForArticleCompletion(articlePage, completionButton)
}

async function readArticleHtml(article: ArticleImportEntry): Promise<string> {
  const html = await readFile(article.sourcePath, 'utf8')

  if (!html.trim()) {
    throw new Error(`The source file is empty: ${article.relativeSourcePath}`)
  }

  return html
}

async function pasteArticleTemplate(articlePage: Page, templateTitle: string, signal?: AbortSignal): Promise<void> {
  const { pasteButton } = getArticleListLocators(articlePage)
  const { cell } = getArticleListEntryLocators(articlePage, templateTitle)

  await requireUniqueLocator(pasteButton, 'Paste article button')

  if (await pasteButton.isDisabled()) {
    throw new Error(`The ArticleFlow template "${templateTitle}" is not available for pasting.`)
  }

  await pasteButton.click()

  const deadline = Date.now() + articleCompletionTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)

    if ((await cell.count()) === 1 && (await cell.isVisible())) {
      return
    }

    await articlePage.waitForTimeout(editorSyncPollIntervalMs)
  }

  throw new Error(`eGain did not finish pasting "${templateTitle}" into the destination folder.`)
}

async function restoreRootArticleTemplate(
  articlePage: Page,
  importRoot: EgainImportParent,
  templateTitle: string,
  folderTraversalCache: FolderTraversalCache,
): Promise<void> {
  await selectFolderPath(articlePage, importRoot, [], undefined, folderTraversalCache)

  const existingTitles = await collectExistingArticleTitles(articlePage)

  if (!existingTitles.has(templateTitle)) {
    await pasteArticleTemplate(articlePage, templateTitle)
  }
}

async function openArticleFromList(articlePage: Page, articleTitle: string): Promise<void> {
  const { cell } = getArticleListEntryLocators(articlePage, articleTitle)

  await requireUniqueLocator(cell, `${articleTitle} article-list entry`)

  const row = cell.locator('xpath=ancestor::tr[@data-testid="grid-body-row-articles"][1]')
  const articleId = await row.getAttribute('data-id')

  if (!articleId || !/^[A-Za-z0-9_-]+$/.test(articleId)) {
    throw new Error(`Could not determine the eGain article ID for "${articleTitle}".`)
  }

  await cell.click()
  await articlePage.waitForURL(new RegExp(`/article/${articleId}/?$`), { timeout: articleOpenTimeoutMs })
}

async function waitForSourceTemplateToLeaveArticleList(
  articlePage: Page,
  sourceTemplateArticleId: string,
  signal?: AbortSignal,
): Promise<void> {
  const articleRows = articlePage.getByTestId('grid-body-row-articles')
  const deadline = Date.now() + articleOpenTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)

    const visibleArticleIds = await articleRows.evaluateAll(rows =>
      rows.filter(row => row.getClientRects().length > 0).map(row => row.getAttribute('data-id')),
    )

    if (!visibleArticleIds.includes(sourceTemplateArticleId)) {
      return
    }

    await articlePage.waitForTimeout(editorSyncPollIntervalMs)
  }

  throw new Error('eGain did not finish refreshing the destination article list.')
}

async function requireUniqueLocator(locator: Locator, description: string) {
  let matchCount = await locator.count()

  if (matchCount === 0) {
    await locator.waitFor({ state: 'visible' })
    matchCount = await locator.count()
  }

  if (matchCount !== 1) {
    throw new Error(`Expected one ${description}, but found ${matchCount}.`)
  }
}

async function submitNewArticleDialog(articlePage: Page, dialog: Locator, doneButton: Locator) {
  const duplicateConflict = articlePage.getByText('Conflicts Article with same name already exists.', { exact: true })

  for (let attempt = 1; attempt <= newArticleDialogSubmitAttempts; attempt += 1) {
    await doneButton.click()

    try {
      await dialog.waitFor({ state: 'hidden', timeout: newArticleDialogSubmitTimeoutMs })
      return
    } catch {
      if (await duplicateConflict.isVisible()) {
        throw new Error('eGain rejected the article because an article with the same title already exists.')
      }

      if (attempt === newArticleDialogSubmitAttempts) {
        throw new Error(`eGain did not close the New Article dialog after ${newArticleDialogSubmitAttempts} attempts.`)
      }
    }
  }
}

async function waitForReadyArticleEditor(articlePage: Page): Promise<ArticleEditorState> {
  const deadline = Date.now() + editorSyncTimeoutMs

  while (Date.now() < deadline) {
    const editorState = await getVisibleArticleEditorState(articlePage)

    if (editorState?.mode === 'wysiwyg' && editorState.status === 'ready') {
      return editorState
    }

    await articlePage.waitForTimeout(editorSyncPollIntervalMs)
  }

  throw new Error('CKEditor did not become ready for article content.')
}

async function setArticleEditorHtml(articlePage: Page, editorName: string, html: string): Promise<void> {
  await articlePage.evaluate(
    async ({ editorName, html, timeoutMs }) => {
      const editor = (window as CkEditorWindow).CKEDITOR?.instances?.[editorName]

      if (!editor) {
        throw new Error(`Could not find CKEditor instance "${editorName}".`)
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('CKEditor setData callback timed out.')), timeoutMs)

        editor.setData(html, {
          callback: () => {
            window.clearTimeout(timeout)
            editor.fire('change')
            editor.updateElement()
            resolve()
          },
        })
      })
    },
    { editorName, html, timeoutMs: editorSyncTimeoutMs },
  )
}

async function waitForStableArticleEditorData(
  articlePage: Page,
  editorName: string,
  previousEditorData: string,
): Promise<void> {
  const deadline = Date.now() + editorSyncTimeoutMs
  let lastEditorData = ''
  let stableCheckCount = 0

  while (Date.now() < deadline) {
    const editorState = await getArticleEditorState(articlePage, editorName)

    if (editorState && hasRenderedEditorContent(editorState.data, previousEditorData)) {
      const normalizedEditorData = normalizeHtmlLineEndings(editorState.data).trim()

      stableCheckCount = normalizedEditorData === lastEditorData ? stableCheckCount + 1 : 1
      lastEditorData = normalizedEditorData

      if (stableCheckCount >= editorDataStableCheckCount) {
        return
      }
    } else {
      lastEditorData = ''
      stableCheckCount = 0
    }

    await articlePage.waitForTimeout(editorSyncPollIntervalMs)
  }

  throw new Error('CKEditor did not retain the inserted article content.')
}

async function waitForArticleSave(
  articlePage: Page,
  completionButton: Locator,
  editorName: string,
  previousEditorData: string,
): Promise<void> {
  const deadline = Date.now() + articleCompletionTimeoutMs
  const savingIndicator = articlePage.getByText('Saving in Progress', { exact: true })
  let lastEditorData = ''
  let stableCheckCount = 0

  while (Date.now() < deadline) {
    const editorState = await getArticleEditorState(articlePage, editorName)

    if (editorState && hasRenderedEditorContent(editorState.data, previousEditorData)) {
      const normalizedEditorData = normalizeHtmlLineEndings(editorState.data).trim()

      stableCheckCount = normalizedEditorData === lastEditorData ? stableCheckCount + 1 : 1
      lastEditorData = normalizedEditorData

      const saveIsComplete =
        !(await savingIndicator.isVisible()) &&
        (await completionButton.isVisible()) &&
        (await completionButton.isEnabled())

      if (saveIsComplete && stableCheckCount >= editorDataStableCheckCount) {
        return
      }
    } else {
      lastEditorData = ''
      stableCheckCount = 0
    }

    await articlePage.waitForTimeout(editorSyncPollIntervalMs)
  }

  throw new Error('eGain did not save the inserted article content.')
}

async function getVisibleArticleEditorState(articlePage: Page): Promise<ArticleEditorState | null> {
  return articlePage.evaluate(() => {
    const instances = Object.entries((window as CkEditorWindow).CKEDITOR?.instances ?? {}).filter(
      ([, editor]) => (editor.container?.$?.getClientRects().length ?? 0) > 0,
    )

    if (instances.length === 0) {
      return null
    }

    if (instances.length !== 1) {
      throw new Error(`Expected one visible CKEditor instance, but found ${instances.length}.`)
    }

    const [name, editor] = instances[0]

    return {
      data: editor.getData(),
      mode: editor.mode,
      name,
      status: editor.status,
    }
  })
}

async function getArticleEditorState(articlePage: Page, editorName: string): Promise<ArticleEditorState | null> {
  return articlePage.evaluate(name => {
    const editor = (window as CkEditorWindow).CKEDITOR?.instances?.[name]

    if (!editor) {
      return null
    }

    return {
      data: editor.getData(),
      mode: editor.mode,
      name,
      status: editor.status,
    }
  }, editorName)
}

export function normalizeHtmlLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

async function waitForInputValue(articlePage: Page, input: Locator, expectedValue: string, description: string) {
  const deadline = Date.now() + editorSyncTimeoutMs
  let actualValue = ''

  while (Date.now() < deadline) {
    actualValue = await input.inputValue()

    if (actualValue === expectedValue) {
      return
    }

    await articlePage.waitForTimeout(editorSyncPollIntervalMs)
  }

  throw new Error(`Expected the ${description} to be "${expectedValue}", but found "${actualValue}".`)
}

export function hasRenderedEditorContent(editorHtml: string, previousEditorHtml = ''): boolean {
  const normalizedEditorHtml = normalizeHtmlLineEndings(editorHtml).trim()
  const normalizedPreviousHtml = normalizeHtmlLineEndings(previousEditorHtml).trim()

  return normalizedEditorHtml.length > 0 && normalizedEditorHtml !== normalizedPreviousHtml
}

async function waitForArticleCompletion(articlePage: Page, completionButton: Locator) {
  await completionButton.waitFor({ state: 'hidden', timeout: articleCompletionTimeoutMs })
  await articlePage.waitForTimeout(articleCompletionSettleDelayMs)
}
