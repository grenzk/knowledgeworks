import type { Page } from 'playwright'
import { throwIfAutomationCancelled } from '../../../shared/automation/cancellation.ts'
import {
  getArticlePageActionLocators,
  getNewArticleDialogLocators,
} from '../../../shared/egain/editor/get-article-editor-locators.ts'
import { getSelectedFolderReference, selectResolvedFolder } from './folder-tree-navigation.ts'
import { resolveVisibleFolder } from './folder-tree-state.ts'

const destinationAttempts = 3
const dialogTimeoutMs = 10000

/**
 * eGain can retain the previous folder as the New Article default even after
 * the tree and URL have changed. Re-select by ID and verify the dialog before
 * entering any article data. A stale dialog is cancelled, never submitted.
 */
export async function openNewArticleDialogInFolder(
  articlePage: Page,
  folderName: string,
  signal?: AbortSignal,
): Promise<void> {
  const destination = await getSelectedFolderReference(articlePage, signal)

  if (destination.name !== folderName) {
    throw new Error(`Expected the selected article destination to be "${folderName}", but found "${destination.name}".`)
  }

  const { createArticleButton } = getArticlePageActionLocators(articlePage)
  const { dialog, folderPathInput } = getNewArticleDialogLocators(articlePage)
  let actualFolderName = ''

  for (let attempt = 1; attempt <= destinationAttempts; attempt += 1) {
    throwIfAutomationCancelled(signal)
    // Do not use selectFolderPath's already-selected shortcut here: the click
    // refreshes eGain's article-creation destination, not just its tree state.
    const resolved = await resolveVisibleFolder(articlePage, destination)
    await selectResolvedFolder(articlePage, resolved, signal)
    await createArticleButton.click({ timeout: dialogTimeoutMs })
    await dialog.waitFor({ state: 'visible', timeout: dialogTimeoutMs })
    await folderPathInput.waitFor({ state: 'visible', timeout: dialogTimeoutMs })
    actualFolderName = await folderPathInput.inputValue({ timeout: dialogTimeoutMs })

    if (actualFolderName === folderName) {
      return
    }

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: dialogTimeoutMs })
    await dialog.waitFor({ state: 'hidden', timeout: dialogTimeoutMs })
  }

  throw new Error(
    `Expected the New Article folder to be "${folderName}", but found "${actualFolderName || 'none'}" after ${destinationAttempts} attempts.`,
  )
}
