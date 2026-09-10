import { basename } from 'node:path'
import type { Locator, Page } from 'playwright'
import { isAutomationCancellationError, throwIfAutomationCancelled } from '../../../shared/automation/cancellation.ts'
import {
  getArticlePageActionLocators,
  getPublishSummaryDialogLocators,
} from '../../../shared/egain/editor/get-article-editor-locators.ts'
import { findImportRoot } from './article-template.ts'
import { openExistingArticleFromList } from './collect-existing-article-titles.ts'
import type { ArticleImportEntry, ArticleImportPlan } from './create-import-plan.ts'
import { ensureArticleEditMode } from './ensure-article-edit-mode.ts'
import { getSelectedFolderReference, selectFolderPath, type FolderTraversalCache } from './ensure-folder-path.ts'
import { getImportDestinationPath } from './run-article-import.ts'

const articlePublishTimeoutMs = 120000
const articlePublishPollIntervalMs = 200

export type ExistingArticlePublishFailure = {
  article: ArticleImportEntry
  message: string
}

export type ExistingArticlePublishResult = {
  alreadyPublishedArticles: ArticleImportEntry[]
  canceled: boolean
  failedArticles: ExistingArticlePublishFailure[]
  missingArticles: ArticleImportEntry[]
  publishedArticles: ArticleImportEntry[]
  unavailableArticles: ExistingArticlePublishFailure[]
}

export type ExistingArticlePublishProgress =
  | {
      article: ArticleImportEntry
      status: 'already-published' | 'missing' | 'published' | 'started'
    }
  | {
      article: ArticleImportEntry
      message: string
      status: 'failed' | 'unavailable'
    }

export type PublishExistingArticlesOptions = {
  onProgress?: (progress: ExistingArticlePublishProgress) => void
  signal?: AbortSignal
}

/**
 * Publishes selected checked-in articles by matching each local source entry to
 * an exact title in its corresponding eGain folder.
 */
export async function publishExistingArticles(
  articlePage: Page,
  plan: ArticleImportPlan,
  options: PublishExistingArticlesOptions = {},
): Promise<ExistingArticlePublishResult> {
  const { signal } = options
  const publishedArticles: ArticleImportEntry[] = []
  const alreadyPublishedArticles: ArticleImportEntry[] = []
  const missingArticles: ArticleImportEntry[] = []
  const unavailableArticles: ExistingArticlePublishFailure[] = []
  const failedArticles: ExistingArticlePublishFailure[] = []
  const folderTraversalCache: FolderTraversalCache = new Map()
  let canceled = false

  try {
    throwIfAutomationCancelled(signal)
    const selectedFolder = await getSelectedFolderReference(articlePage, signal)
    const rootName = basename(plan.rootPath)
    const importRoot = findImportRoot(selectedFolder, rootName)

    if (!importRoot) {
      throw new Error(`Select the eGain root "${rootName}" or one of its folders before publishing.`)
    }

    for (const article of plan.articles) {
      try {
        throwIfAutomationCancelled(signal)
        options.onProgress?.({ article, status: 'started' })

        const destinationFolderPath = getImportDestinationPath(article.folderPath, rootName)

        await selectFolderPath(articlePage, importRoot, destinationFolderPath, signal, folderTraversalCache)

        const articleState = await openExistingArticleFromList(articlePage, article.title, signal)

        if (articleState === null) {
          missingArticles.push(article)
          options.onProgress?.({ article, status: 'missing' })
          continue
        }

        if (articleState === 'published') {
          alreadyPublishedArticles.push(article)
          options.onProgress?.({ article, status: 'already-published' })
          continue
        }

        if (articleState !== 'checked-in') {
          const message =
            articleState === 'checked-out'
              ? 'Article is checked out and must be checked in before publishing.'
              : 'The article-list icon did not identify this article as checked in.'

          unavailableArticles.push({ article, message })
          options.onProgress?.({ article, message, status: 'unavailable' })
          continue
        }

        await publishCheckedInArticle(articlePage, signal)
        publishedArticles.push(article)
        options.onProgress?.({ article, status: 'published' })
      } catch (error) {
        if (isAutomationCancellationError(error)) {
          canceled = true
          break
        }

        const message = error instanceof Error ? error.message : String(error)

        failedArticles.push({ article, message })
        options.onProgress?.({ article, message, status: 'failed' })
      }
    }
  } catch (error) {
    if (isAutomationCancellationError(error)) {
      canceled = true
    } else {
      throw error
    }
  }

  canceled ||= signal?.aborted ?? false

  return {
    alreadyPublishedArticles,
    canceled,
    failedArticles,
    missingArticles,
    publishedArticles,
    unavailableArticles,
  }
}

async function publishCheckedInArticle(articlePage: Page, signal?: AbortSignal): Promise<void> {
  await requireCheckedInEditButton(articlePage, signal)
  await ensureArticleEditMode(articlePage, signal, articlePublishTimeoutMs)

  const { publishArticleButton } = getArticlePageActionLocators(articlePage)

  await requireUniqueLocator(publishArticleButton, 'Publish button')
  await waitForEnabledLocator(articlePage, publishArticleButton, 'Publish button', signal)
  await publishArticleButton.click()

  const { dialog, doneButton } = getPublishSummaryDialogLocators(articlePage)

  await requireUniqueLocator(dialog, 'Publish summary dialog')
  await requireUniqueLocator(doneButton, 'Publish summary Done button')
  await doneButton.click()
  await dialog.waitFor({ state: 'hidden', timeout: articlePublishTimeoutMs })
  await waitForReadOnlyArticle(articlePage, signal)
}

async function requireCheckedInEditButton(articlePage: Page, signal?: AbortSignal): Promise<void> {
  const { editArticleButton } = getArticlePageActionLocators(articlePage)

  await waitForEnabledLocator(articlePage, editArticleButton, 'checked-in article Edit button', signal)
}

async function waitForEnabledLocator(
  articlePage: Page,
  locator: Locator,
  description: string,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + articlePublishTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    const matchCount = await locator.count()

    if (matchCount > 1) {
      throw new Error(`Expected one ${description}, but found ${matchCount}.`)
    }

    if (matchCount === 1 && (await locator.isVisible()) && (await locator.isEnabled())) {
      return
    }

    await articlePage.waitForTimeout(articlePublishPollIntervalMs)
  }

  throw new Error(`${description} did not become available.`)
}

async function waitForReadOnlyArticle(articlePage: Page, signal?: AbortSignal): Promise<void> {
  const { editArticleButton, saveArticleButton } = getArticlePageActionLocators(articlePage)
  const deadline = Date.now() + articlePublishTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)

    if ((await editArticleButton.isVisible()) && !(await saveArticleButton.isVisible())) {
      return
    }

    await articlePage.waitForTimeout(articlePublishPollIntervalMs)
  }

  throw new Error('eGain did not return the published article to read-only mode.')
}

async function requireUniqueLocator(locator: Locator, description: string): Promise<void> {
  let matchCount = await locator.count()

  if (matchCount === 0) {
    await locator.waitFor({ state: 'visible', timeout: articlePublishTimeoutMs })
    matchCount = await locator.count()
  }

  if (matchCount !== 1) {
    throw new Error(`Expected one ${description}, but found ${matchCount}.`)
  }
}
