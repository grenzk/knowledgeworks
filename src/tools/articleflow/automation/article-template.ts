import { basename } from 'node:path'
import type { Locator, Page } from 'playwright'
import { throwIfAutomationCancelled } from '../../../shared/automation/cancellation.ts'
import {
  getArticleEditorLocators,
  getArticleListEntryLocators,
  getArticleListLocators,
  getArticlePageActionLocators,
  getCustomAttributesLocators,
  getNewArticleDialogLocators,
} from '../../../shared/egain/editor/get-article-editor-locators.ts'
import { collectExistingArticleTitles } from './collect-existing-article-titles.ts'
import type { ArticleImportPlan } from './create-import-plan.ts'
import { ensureArticleEditMode } from './ensure-article-edit-mode.ts'
import { openNewArticleDialogInFolder } from './open-new-article-dialog.ts'
import {
  ensureFolderPath,
  getSelectedFolderReference,
  selectFolderPath,
  type EgainImportParent,
} from './ensure-folder-path.ts'

const articleUiTimeoutMs = 60000
const articleUiPollIntervalMs = 100
const customAttributesOpenAttempts = 3
const customAttributesOpenTimeoutMs = 5000
const newArticleDialogSubmitAttempts = 3
const newArticleDialogSubmitTimeoutMs = 10000
const saveSettleDelayMs = 1000

export const articleFlowTemplateTitle = '_ArticleFlow Template'

export type ArticleTemplatePreparationResult = {
  rootCreated: boolean
  rootName: string
  templateCreated: boolean
  templateTitle: string
}

export type CompletedArticleTemplateSetup = {
  templateArticleId: string
}

/**
 * Creates or reuses the product root and template article, then opens Custom
 * Attributes so the user can configure the product-level metadata once.
 */
export async function prepareArticleTemplate(
  articlePage: Page,
  plan: ArticleImportPlan,
  signal?: AbortSignal,
): Promise<ArticleTemplatePreparationResult> {
  throwIfAutomationCancelled(signal)

  const rootName = basename(plan.rootPath)
  const selectedFolder = await getSelectedFolderReference(articlePage, signal)
  let importRoot = findImportRoot(selectedFolder, rootName)
  let rootCreated = false

  if (!importRoot) {
    rootCreated = await ensureFolderPath(articlePage, selectedFolder, [rootName], signal)
    await selectFolderPath(articlePage, selectedFolder, [rootName], signal)
    importRoot = await getSelectedFolderReference(articlePage, signal)
  } else {
    await selectFolderPath(articlePage, importRoot, [], signal)
  }

  if (importRoot.name !== rootName) {
    throw new Error(`Expected the ArticleFlow root to be "${rootName}", but found "${importRoot.name}".`)
  }

  const existingTitles = await collectExistingArticleTitles(articlePage, signal)
  const templateCreated = !existingTitles.has(articleFlowTemplateTitle)

  if (templateCreated) {
    await createTemplateArticle(articlePage, rootName, signal)
  } else {
    await openArticleFromList(articlePage, articleFlowTemplateTitle)
  }

  await ensureArticleEditMode(articlePage, signal, articleUiTimeoutMs)
  await openCustomAttributes(articlePage)

  return {
    rootCreated,
    rootName,
    templateCreated,
    templateTitle: articleFlowTemplateTitle,
  }
}

/**
 * Saves the configured template, copies it through the article-list menu, and
 * restores the product root as the selected ArticleFlow destination.
 */
export async function completeArticleTemplateSetup(
  articlePage: Page,
  plan: ArticleImportPlan,
  signal?: AbortSignal,
): Promise<CompletedArticleTemplateSetup> {
  throwIfAutomationCancelled(signal)

  const { dialog } = getCustomAttributesLocators(articlePage)

  if (await dialog.isVisible()) {
    throw new Error('Finish the Custom Attributes dialog in eGain before continuing the import.')
  }

  const { editArticleButton, saveArticleButton } = getArticlePageActionLocators(articlePage)

  if (await saveArticleButton.isVisible()) {
    const { articleTitleInput } = getArticleEditorLocators(articlePage)
    const currentTitle = await articleTitleInput.inputValue()

    if (currentTitle !== articleFlowTemplateTitle) {
      throw new Error(`Return to "${articleFlowTemplateTitle}" before continuing the import.`)
    }

    await saveArticleButton.click()
    await articlePage.waitForTimeout(saveSettleDelayMs)
  } else if (!(await editArticleButton.isVisible())) {
    throw new Error('Could not determine whether the ArticleFlow template was saved.')
  }

  const rootName = basename(plan.rootPath)
  const selectedFolder = await getSelectedFolderReference(articlePage, signal)
  const importRoot = findImportRoot(selectedFolder, rootName)

  if (!importRoot) {
    throw new Error(`Could not find the ArticleFlow root "${rootName}" in the selected eGain folder path.`)
  }

  await selectFolderPath(articlePage, importRoot, [], signal)

  const existingTitles = await collectExistingArticleTitles(articlePage, signal)

  if (!existingTitles.has(articleFlowTemplateTitle)) {
    throw new Error(`Could not find "${articleFlowTemplateTitle}" in the ArticleFlow root.`)
  }

  const templateArticleId = await copyArticleFromList(articlePage, articleFlowTemplateTitle, signal)

  return { templateArticleId }
}

/**
 * Finds the product root within the selected folder and its visible ancestors.
 */
export function findImportRoot(selectedFolder: EgainImportParent, rootName: string): EgainImportParent | undefined {
  const selectedPath = [...selectedFolder.ancestorPath, selectedFolder]
  let rootIndex = -1

  selectedPath.forEach((folder, index) => {
    if (folder.name === rootName) {
      rootIndex = index
    }
  })

  if (rootIndex === -1) {
    return undefined
  }

  return {
    ...selectedPath[rootIndex],
    ancestorPath: selectedPath.slice(0, rootIndex),
  }
}

async function createTemplateArticle(articlePage: Page, rootName: string, signal?: AbortSignal): Promise<void> {
  const { dialog, doneButton, titleInput } = getNewArticleDialogLocators(articlePage)

  await openNewArticleDialogInFolder(articlePage, rootName, signal)

  await requireUniqueLocator(titleInput, 'New Article title input')
  await titleInput.fill(articleFlowTemplateTitle)
  await requireUniqueLocator(doneButton, 'New Article Done button')
  await submitNewArticleDialog(articlePage, dialog, doneButton)
}

async function openArticleFromList(articlePage: Page, articleTitle: string): Promise<void> {
  const { cell } = getArticleListEntryLocators(articlePage, articleTitle)

  await requireUniqueLocator(cell, `${articleTitle} article-list entry`)
  await cell.click()
  await articlePage.waitForURL(/\/article\/[^/]+\/?$/, { timeout: articleUiTimeoutMs })
}

async function openCustomAttributes(articlePage: Page): Promise<void> {
  const { dialog } = getCustomAttributesLocators(articlePage)

  if (await dialog.isVisible()) {
    return
  }

  for (let attempt = 1; attempt <= customAttributesOpenAttempts; attempt += 1) {
    try {
      const { dialog: currentDialog, editButton, sectionHeading } = getCustomAttributesLocators(articlePage)

      await requireUniqueLocator(sectionHeading, 'Custom Attributes heading')
      await sectionHeading.scrollIntoViewIfNeeded()
      await sectionHeading.hover()
      await editButton.waitFor({ state: 'visible', timeout: customAttributesOpenTimeoutMs })
      await requireUniqueLocator(editButton, 'Custom Attributes Edit button')
      await editButton.click({ timeout: customAttributesOpenTimeoutMs })
      await currentDialog.waitFor({ state: 'visible', timeout: customAttributesOpenTimeoutMs })

      return
    } catch (error) {
      if (attempt === customAttributesOpenAttempts) {
        const reason = error instanceof Error ? error.message : String(error)

        throw new Error(
          `eGain did not open the Custom Attributes dialog after ${customAttributesOpenAttempts} attempts. Last error: ${reason}`,
        )
      }

      await articlePage.waitForTimeout(articleUiPollIntervalMs)
    }
  }
}

async function copyArticleFromList(articlePage: Page, articleTitle: string, signal?: AbortSignal): Promise<string> {
  const { cell, contextMenu, contextMenuButton, copyMenuItem } = getArticleListEntryLocators(articlePage, articleTitle)
  const { pasteButton } = getArticleListLocators(articlePage)

  await requireUniqueLocator(cell, `${articleTitle} article-list entry`)

  const articleRow = cell.locator('xpath=ancestor::tr[@data-testid="grid-body-row-articles"][1]')
  const articleId = await articleRow.getAttribute('data-id')

  if (!articleId || !/^[A-Za-z0-9_-]+$/.test(articleId)) {
    throw new Error(`Could not determine the eGain article ID for "${articleTitle}".`)
  }

  await requireUniqueLocator(contextMenuButton, `${articleTitle} context-menu button`)
  await contextMenuButton.click({ force: true })
  await contextMenu.waitFor({ state: 'visible', timeout: articleUiTimeoutMs })
  await requireUniqueLocator(copyMenuItem, `${articleTitle} Copy action`)
  await copyMenuItem.click()

  const deadline = Date.now() + articleUiTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)

    if ((await pasteButton.isVisible()) && !(await pasteButton.isDisabled())) {
      return articleId
    }

    await articlePage.waitForTimeout(articleUiPollIntervalMs)
  }

  throw new Error(`eGain did not make "${articleTitle}" available for pasting.`)
}

async function submitNewArticleDialog(articlePage: Page, dialog: Locator, doneButton: Locator): Promise<void> {
  const duplicateConflict = articlePage.getByText('Conflicts Article with same name already exists.', { exact: true })

  for (let attempt = 1; attempt <= newArticleDialogSubmitAttempts; attempt += 1) {
    await doneButton.click()

    try {
      await dialog.waitFor({ state: 'hidden', timeout: newArticleDialogSubmitTimeoutMs })
      return
    } catch {
      if (await duplicateConflict.isVisible()) {
        throw new Error(`An article named "${articleFlowTemplateTitle}" already exists in the product root.`)
      }

      if (attempt === newArticleDialogSubmitAttempts) {
        throw new Error(`eGain did not close the New Article dialog after ${newArticleDialogSubmitAttempts} attempts.`)
      }
    }
  }
}

async function requireUniqueLocator(locator: Locator, description: string): Promise<void> {
  let matchCount = await locator.count()

  if (matchCount === 0) {
    await locator.waitFor({ state: 'visible' })
    matchCount = await locator.count()
  }

  if (matchCount !== 1) {
    throw new Error(`Expected one ${description}, but found ${matchCount}.`)
  }
}
