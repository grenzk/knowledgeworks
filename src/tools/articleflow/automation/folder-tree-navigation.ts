import type { Page } from 'playwright'
import { throwIfAutomationCancelled } from '../../../shared/automation/cancellation.ts'
import { getArticleFolderLocators } from '../../../shared/egain/editor/get-article-editor-locators.ts'
import {
  FolderTreeChangedError,
  FolderTreeStructureError,
  getDirectChildFolderReferences,
  getFolderRowById,
  getFolderTreeEntries,
  isFolderSelectionComplete,
  resolveVisibleFolder,
  toFolderReference,
  type EgainFolderReference,
  type EgainImportParent,
  type FolderTraversalCache,
  type ResolvedFolder,
} from './folder-tree-state.ts'

const activeFolderLoaderSelector = '[data-testid="loader"].loader-container-show:visible'
const folderTreeRetryLimit = 3
export const folderActionTimeoutMs = 8000
export const folderUiTimeoutMs = 60000
export const folderUiPollIntervalMs = 100
const folderSelectionSettleDelayMs = 500
const duplicateFolderSettleTimeoutMs = 3000

/**
 * Returns the selected eGain folder and its visible ancestor path when an
 * ArticleFlow import starts.
 */
export async function getSelectedFolderReference(articlePage: Page, signal?: AbortSignal): Promise<EgainImportParent> {
  await waitForFolderUiReady(articlePage, signal)

  const entries = await getFolderTreeEntries(articlePage)
  const selectedEntries = entries.filter(entry => entry.selected)

  if (selectedEntries.length !== 1) {
    throw new Error(`Expected one selected eGain folder, but found ${selectedEntries.length}.`)
  }

  const selectedFolder = selectedEntries[0]
  const entriesById = new Map(entries.map(entry => [entry.id, entry]))
  const ancestorPath: EgainFolderReference[] = []
  let parentId = selectedFolder.parentId

  while (parentId) {
    const parent = entriesById.get(parentId)

    if (!parent) {
      throw new Error(`Could not determine the ancestor path for folder "${selectedFolder.name}".`)
    }

    ancestorPath.unshift(toFolderReference(parent))
    parentId = parent.parentId
  }

  return { ...toFolderReference(selectedFolder), ancestorPath }
}

/**
 * Resolves and selects one existing folder path beneath the import parent.
 */
export async function selectFolderPath(
  articlePage: Page,
  importParent: EgainImportParent,
  folderPath: string[],
  signal?: AbortSignal,
  cache: FolderTraversalCache = new Map(),
): Promise<void> {
  cacheFolderReference(cache, [], importParent)

  await retryFolderTreeOperation(
    articlePage,
    `select folder path "${formatFolderPath(folderPath)}"`,
    async () => {
      const destination = await resolveFolderPathOnce(articlePage, importParent, folderPath, signal, cache)

      if (!(await isFolderSelectionComplete(articlePage, destination.folder.id))) {
        await selectResolvedFolder(articlePage, destination, signal)
      }
    },
    signal,
  )
}

export async function resolveDirectChild(
  articlePage: Page,
  importParent: EgainImportParent,
  parentPath: string[],
  folderName: string,
  signal?: AbortSignal,
  cache: FolderTraversalCache = new Map(),
): Promise<EgainFolderReference | null> {
  return retryFolderTreeOperation(
    articlePage,
    `resolve folder "${folderName}" under "${formatFolderPath(parentPath, importParent.name)}"`,
    async () => {
      const parent = await resolveFolderPathOnce(articlePage, importParent, parentPath, signal, cache)
      const expandedParent = await expandResolvedFolder(articlePage, parent, signal)

      return findDirectChildFolder(articlePage, expandedParent.folder, folderName, signal)
    },
    signal,
  )
}

export async function resolveFolderPathOnce(
  articlePage: Page,
  importParent: EgainImportParent,
  folderPath: string[],
  signal?: AbortSignal,
  cache: FolderTraversalCache = new Map(),
): Promise<ResolvedFolder> {
  const cachedFolder = await resolveDeepestVisibleCachedFolder(articlePage, folderPath, cache)
  let current = cachedFolder?.resolved ?? (await resolveImportParentOnce(articlePage, importParent, signal))
  const resolvedDepth = cachedFolder?.depth ?? 0

  cacheFolderReference(cache, folderPath.slice(0, resolvedDepth), current.folder)

  for (const [index, folderName] of folderPath.slice(resolvedDepth).entries()) {
    throwIfAutomationCancelled(signal)
    current = await expandResolvedFolder(articlePage, current, signal)

    const child = await findDirectChildFolder(articlePage, current.folder, folderName, signal)

    if (!child) {
      throw new FolderTreeChangedError(`Could not find folder "${folderName}" directly under "${current.folder.name}".`)
    }

    current = await resolveVisibleFolder(articlePage, child)
    cacheFolderReference(cache, folderPath.slice(0, resolvedDepth + index + 1), child)
  }

  return current
}

async function resolveDeepestVisibleCachedFolder(
  articlePage: Page,
  folderPath: string[],
  cache: FolderTraversalCache,
): Promise<{ depth: number; resolved: ResolvedFolder } | undefined> {
  for (let depth = folderPath.length; depth >= 0; depth -= 1) {
    const folder = cache.get(getFolderPathKey(folderPath.slice(0, depth)))

    if (!folder) {
      continue
    }

    const row = getFolderRowById(articlePage, folder.id)

    if ((await row.count()) === 1 && (await row.isVisible())) {
      return { depth, resolved: { folder, row } }
    }
  }
}

async function resolveImportParentOnce(
  articlePage: Page,
  importParent: EgainImportParent,
  signal?: AbortSignal,
): Promise<ResolvedFolder> {
  const importPath = [...importParent.ancestorPath, toFolderReference(importParent)]
  const [topLevelFolder, ...nestedFolders] = importPath

  if (!topLevelFolder) {
    throw new FolderTreeStructureError('The selected eGain import parent has no resolvable folder path.')
  }

  let current = await resolveVisibleFolder(articlePage, topLevelFolder)

  for (const expectedFolder of nestedFolders) {
    throwIfAutomationCancelled(signal)
    current = await expandResolvedFolder(articlePage, current, signal)

    const directChildren = await getDirectChildFolderReferences(articlePage, current.folder.id)
    const matchingFolder = directChildren.find(folder => folder.id === expectedFolder.id)

    if (!matchingFolder) {
      throw new FolderTreeChangedError(`Folder "${expectedFolder.name}" disappeared while reopening the import parent.`)
    }

    current = await resolveVisibleFolder(articlePage, matchingFolder)
  }

  return current
}

export async function selectResolvedFolder(
  articlePage: Page,
  destination: ResolvedFolder,
  signal?: AbortSignal,
): Promise<void> {
  await waitForFolderUiReady(articlePage, signal)

  const freshDestination = await resolveVisibleFolder(articlePage, destination.folder)
  const { cell } = getArticleFolderLocators(freshDestination.row, freshDestination.folder.name)

  if ((await cell.count()) !== 1) {
    throw new FolderTreeChangedError(`Folder "${freshDestination.folder.name}" disappeared before selection.`)
  }

  await cell.click({ timeout: folderActionTimeoutMs })
  await waitForFolderSelection(articlePage, freshDestination.folder, signal)
  await articlePage.waitForTimeout(folderSelectionSettleDelayMs)
  await waitForFolderUiReady(articlePage, signal)
}

async function waitForFolderSelection(
  articlePage: Page,
  expectedFolder: EgainFolderReference,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + folderUiTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    if (await isFolderSelectionComplete(articlePage, expectedFolder.id)) {
      await waitForFolderUiReady(articlePage, signal)

      if (await isFolderSelectionComplete(articlePage, expectedFolder.id)) {
        return
      }
    }

    await articlePage.waitForTimeout(folderUiPollIntervalMs)
  }

  throw new FolderTreeChangedError(`eGain did not select folder "${expectedFolder.name}".`)
}

async function expandResolvedFolder(
  articlePage: Page,
  folder: ResolvedFolder,
  signal?: AbortSignal,
): Promise<ResolvedFolder> {
  await waitForFolderUiReady(articlePage, signal)

  const current = await resolveVisibleFolder(articlePage, folder.folder)
  const { collapseButton, expandButton } = getArticleFolderLocators(current.row, current.folder.name)
  const collapseButtonCount = await collapseButton.count()
  const expandButtonCount = await expandButton.count()

  if (collapseButtonCount > 1 || expandButtonCount > 1) {
    throw new FolderTreeStructureError(`Expected one hierarchy control for folder "${current.folder.name}".`)
  }

  if (await collapseButton.isVisible()) {
    if ((await getDirectChildFolderReferences(articlePage, current.folder.id)).length === 0) {
      throw new FolderTreeChangedError(`Folder "${current.folder.name}" lost its visible child rows.`)
    }

    return current
  }

  if (!(await expandButton.isVisible())) {
    return current
  }

  await expandButton.click({ timeout: folderActionTimeoutMs })
  await waitForFolderExpansion(articlePage, current.folder, signal)

  return resolveVisibleFolder(articlePage, current.folder)
}

async function waitForFolderExpansion(
  articlePage: Page,
  folder: EgainFolderReference,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + folderUiTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    await waitForFolderUiReady(articlePage, signal)

    const row = getFolderRowById(articlePage, folder.id)

    if ((await row.count()) !== 1) {
      throw new FolderTreeChangedError(`Folder "${folder.name}" disappeared while it was expanding.`)
    }

    const { collapseButton } = getArticleFolderLocators(row, folder.name)

    if (
      (await collapseButton.isVisible()) &&
      (await getDirectChildFolderReferences(articlePage, folder.id)).length > 0
    ) {
      return
    }

    await articlePage.waitForTimeout(folderUiPollIntervalMs)
  }

  throw new FolderTreeChangedError(`Folder "${folder.name}" did not finish expanding.`)
}

async function findDirectChildFolder(
  articlePage: Page,
  parentFolder: EgainFolderReference,
  folderName: string,
  signal?: AbortSignal,
): Promise<EgainFolderReference | null> {
  const deadline = Date.now() + duplicateFolderSettleTimeoutMs
  let matchingFolders: EgainFolderReference[] = []

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    matchingFolders = (await getDirectChildFolderReferences(articlePage, parentFolder.id)).filter(
      folder => folder.name === folderName,
    )

    if (matchingFolders.length <= 1) {
      return matchingFolders[0] ?? null
    }

    await articlePage.waitForTimeout(folderUiPollIntervalMs)
  }

  await refreshFolderChildren(articlePage, parentFolder, signal)
  matchingFolders = (await getDirectChildFolderReferences(articlePage, parentFolder.id)).filter(
    folder => folder.name === folderName,
  )

  if (matchingFolders.length > 1) {
    throw new FolderTreeStructureError(
      `eGain still returned multiple folders named "${folderName}" under the same parent after refreshing that branch. Verify the destination before retrying.`,
    )
  }

  return matchingFolders[0] ?? null
}

async function refreshFolderChildren(
  articlePage: Page,
  parentFolder: EgainFolderReference,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAutomationCancelled(signal)
  const current = await resolveVisibleFolder(articlePage, parentFolder)
  const { collapseButton } = getArticleFolderLocators(current.row, current.folder.name)

  if (await collapseButton.isVisible()) {
    await collapseButton.click({ timeout: folderActionTimeoutMs })

    const deadline = Date.now() + folderUiTimeoutMs

    while (Date.now() < deadline) {
      throwIfAutomationCancelled(signal)
      await waitForFolderUiReady(articlePage, signal)

      const freshParent = await resolveVisibleFolder(articlePage, parentFolder)
      const { expandButton } = getArticleFolderLocators(freshParent.row, freshParent.folder.name)

      if (await expandButton.isVisible()) {
        await expandResolvedFolder(articlePage, freshParent, signal)
        return
      }

      await articlePage.waitForTimeout(folderUiPollIntervalMs)
    }

    throw new FolderTreeChangedError(`Folder "${parentFolder.name}" did not finish refreshing.`)
  }

  await expandResolvedFolder(articlePage, current, signal)
}

export async function retryFolderTreeOperation<T>(
  articlePage: Page,
  description: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= folderTreeRetryLimit; attempt += 1) {
    try {
      throwIfAutomationCancelled(signal)
      await waitForFolderUiReady(articlePage, signal)

      return await operation()
    } catch (error) {
      if (error instanceof FolderTreeStructureError || !isRetryableFolderTreeError(error)) {
        throw error
      }

      lastError = error

      if (attempt < folderTreeRetryLimit) {
        await articlePage.waitForTimeout(folderUiPollIntervalMs)
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)

  throw new Error(
    `Could not ${description} after ${folderTreeRetryLimit} attempts because eGain kept rerendering the folder tree. Last error: ${reason}`,
  )
}

function isRetryableFolderTreeError(error: unknown): boolean {
  if (error instanceof FolderTreeChangedError) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  return /detached from the DOM|intercepts pointer events|locator\.(?:click|evaluate)|strict mode violation/i.test(
    error.message,
  )
}

export async function waitForFolderUiReady(articlePage: Page, signal?: AbortSignal): Promise<void> {
  const activeLoaders = articlePage.locator(activeFolderLoaderSelector)
  const deadline = Date.now() + folderUiTimeoutMs

  while (Date.now() < deadline) {
    throwIfAutomationCancelled(signal)
    if ((await activeLoaders.count()) === 0) {
      return
    }

    await articlePage.waitForTimeout(folderUiPollIntervalMs)
  }

  throw new Error('eGain did not finish loading the folder workspace.')
}

export function formatFolderPath(folderPath: string[], rootName?: string): string {
  return [rootName, ...folderPath].filter(Boolean).join(' > ')
}

export function getFolderPathKey(folderPath: string[]): string {
  return JSON.stringify(folderPath)
}

export function cacheFolderReference(
  cache: FolderTraversalCache,
  folderPath: string[],
  folder: EgainFolderReference,
): void {
  cache.set(getFolderPathKey(folderPath), toFolderReference(folder))
}
