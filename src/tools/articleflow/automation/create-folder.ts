import type { Locator, Page } from 'playwright'
import { throwIfAutomationCancelled } from '../../../shared/automation/cancellation.ts'
import {
  getArticleFolderLocators,
  getCreateFolderFormLocators,
} from '../../../shared/egain/editor/get-article-editor-locators.ts'
import {
  cacheFolderReference,
  folderActionTimeoutMs,
  folderUiPollIntervalMs,
  folderUiTimeoutMs,
  formatFolderPath,
  resolveDirectChild,
  resolveFolderPathOnce,
  retryFolderTreeOperation,
  selectFolderPath,
  selectResolvedFolder,
} from './folder-tree-navigation.ts'
import {
  FolderTreeChangedError,
  getFolderIdFromUrl,
  getFolderRowById,
  isFolderSelectionComplete,
  resolveVisibleFolder,
  type EgainFolderReference,
  type EgainImportParent,
  type FolderTraversalCache,
} from './folder-tree-state.ts'

const createdFolderStableSnapshotCount = 3

export async function createChildFolder(
  articlePage: Page,
  importParent: EgainImportParent,
  parentPath: string[],
  folderName: string,
  signal?: AbortSignal,
  cache: FolderTraversalCache = new Map(),
): Promise<EgainFolderReference> {
  throwIfAutomationCancelled(signal)
  const selectedParent = await openCreateFolderForm(articlePage, importParent, parentPath, signal, cache)
  const { backButton, heading, nameInput, saveButton } = getCreateFolderFormLocators(articlePage)

  await requireUniqueLocator(heading, 'Create Folder heading')

  if (getFolderIdFromUrl(articlePage.url()) !== selectedParent.id || !isCreateFolderUrl(articlePage.url())) {
    throw new Error(`The Create Folder form did not open under "${selectedParent.name}".`)
  }

  await requireUniqueLocator(nameInput, 'Create Folder name input')
  await nameInput.fill(folderName)
  await requireUniqueLocator(saveButton, 'Create Folder Save button')
  await saveButton.click()

  await requireUniqueLocator(backButton, 'Create Folder Back button')
  await backButton.click()
  await heading.waitFor({ state: 'hidden' })
  await articlePage.getByRole('heading', { exact: true, name: 'Folders' }).waitFor({ state: 'visible' })

  const createdFolder = await waitForCreatedFolder(articlePage, importParent, parentPath, folderName, signal, cache)

  cacheFolderReference(cache, [...parentPath, folderName], createdFolder)
  await selectFolderPath(articlePage, importParent, [...parentPath, folderName], signal, cache)

  return createdFolder
}

async function openCreateFolderForm(
  articlePage: Page,
  importParent: EgainImportParent,
  parentPath: string[],
  signal?: AbortSignal,
  cache: FolderTraversalCache = new Map(),
): Promise<EgainFolderReference> {
  return retryFolderTreeOperation(
    articlePage,
    `open Create Folder under "${formatFolderPath(parentPath, importParent.name)}"`,
    async () => {
      const parent = await resolveFolderPathOnce(articlePage, importParent, parentPath, signal, cache)

      if (!(await isFolderSelectionComplete(articlePage, parent.folder.id))) {
        await selectResolvedFolder(articlePage, parent, signal)
      }

      const freshParent = await resolveVisibleFolder(articlePage, parent.folder)
      const { addFolderMenuItem, contextMenuButton } = getArticleFolderLocators(
        freshParent.row,
        freshParent.folder.name,
      )

      if ((await contextMenuButton.count()) !== 1) {
        throw new FolderTreeChangedError(`The context menu for "${freshParent.folder.name}" disappeared.`)
      }

      if (!(await contextMenuButton.isVisible())) {
        throw new FolderTreeChangedError(`The context menu for "${freshParent.folder.name}" remained hidden.`)
      }

      if (!(await addFolderMenuItem.isVisible())) {
        await contextMenuButton.click({ timeout: folderActionTimeoutMs })
      }

      await waitForFolderMenuItem(articlePage, freshParent.folder, addFolderMenuItem, signal)
      await addFolderMenuItem.click({ timeout: folderActionTimeoutMs })

      return freshParent.folder
    },
    signal,
  )
}

async function waitForFolderMenuItem(
  articlePage: Page,
  parentFolder: EgainFolderReference,
  menuItem: Locator,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + folderActionTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    if ((await getFolderRowById(articlePage, parentFolder.id).count()) === 0) {
      throw new FolderTreeChangedError(`Folder "${parentFolder.name}" disappeared while opening its context menu.`)
    }

    if (await menuItem.isVisible()) {
      return
    }

    await articlePage.waitForTimeout(folderUiPollIntervalMs)
  }

  throw new FolderTreeChangedError(`The Add action for folder "${parentFolder.name}" did not appear.`)
}

async function waitForCreatedFolder(
  articlePage: Page,
  importParent: EgainImportParent,
  parentPath: string[],
  folderName: string,
  signal?: AbortSignal,
  cache: FolderTraversalCache = new Map(),
): Promise<EgainFolderReference> {
  const deadline = Date.now() + folderUiTimeoutMs
  let stableFolderId: string | undefined
  let stableSnapshotCount = 0

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    const createdFolder = await resolveDirectChild(articlePage, importParent, parentPath, folderName, signal, cache)

    if (createdFolder) {
      if (createdFolder.id === stableFolderId) {
        stableSnapshotCount += 1
      } else {
        stableFolderId = createdFolder.id
        stableSnapshotCount = 1
      }

      if (stableSnapshotCount >= createdFolderStableSnapshotCount) {
        return createdFolder
      }
    } else {
      stableFolderId = undefined
      stableSnapshotCount = 0
    }

    await articlePage.waitForTimeout(folderUiPollIntervalMs)
  }

  throw new Error(`eGain did not display the newly created folder "${folderName}".`)
}

function isCreateFolderUrl(value: string): boolean {
  try {
    return /\/create\/?$/.test(new URL(value).pathname)
  } catch {
    return false
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
