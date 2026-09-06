import type { Locator, Page } from 'playwright'

const folderTreeRowSelector = 'tr[data-testid="grid-body-row-folders"]'
const folderCellTestIdPrefix = 'grid-body-cell-folders-'

export type EgainFolderReference = {
  id: string
  name: string
}

export type EgainImportParent = EgainFolderReference & {
  ancestorPath: EgainFolderReference[]
}

export type FolderTraversalCache = Map<string, EgainFolderReference>

export type ResolvedFolder = {
  folder: EgainFolderReference
  row: Locator
}

export type FolderTreeEntry = EgainFolderReference & {
  level: number
  parentId?: string
  selected: boolean
}

export class FolderTreeChangedError extends Error {}

export class FolderTreeStructureError extends Error {}

export async function getFolderTreeEntries(articlePage: Page): Promise<FolderTreeEntry[]> {
  const entries = await articlePage
    .locator(folderTreeRowSelector)
    .filter({ visible: true })
    .evaluateAll(
      (rows, options) => {
        const entries: FolderTreeEntry[] = []

        rows.forEach(row => {
          const levelMatch = row.className.match(/\blevel-(\d+)\b/)

          if (!levelMatch) {
            return
          }

          const belongsToRow = (element: Element) => element.closest(options.folderTreeRowSelector) === row
          const folderCell = Array.from(
            row.querySelectorAll<HTMLElement>(`[data-testid^="${options.folderCellTestIdPrefix}"]`),
          ).find(belongsToRow)
          const contextMenuIcon = Array.from(
            row.querySelectorAll<HTMLElement>('[id^="ic-dot-menu-"][id$="-context"]'),
          ).find(belongsToRow)
          const name = folderCell?.dataset.testid?.slice(options.folderCellTestIdPrefix.length)
          const id = contextMenuIcon?.id.match(/^ic-dot-menu-(.+)-context$/)?.[1]

          if (!id || !name) {
            return
          }

          const level = Number(levelMatch[1])

          entries.push({
            id,
            level,
            name,
            selected: row.classList.contains('selected-table-row'),
          })
        })

        return entries
      },
      { folderCellTestIdPrefix, folderTreeRowSelector },
    )

  return normalizeFolderTreeEntries(entries)
}

/**
 * eGain sometimes leaves an earlier copy of a created row at the wrong depth.
 * Keep the last visible occurrence, as getFolderRowById does, before deriving
 * ancestry so stale copies cannot create ambiguous selections or parents.
 */
export function normalizeFolderTreeEntries(entries: FolderTreeEntry[]): FolderTreeEntry[] {
  const lastIndexById = new Map(entries.map((entry, index) => [entry.id, index]))
  const folderIdsByLevel: string[] = []

  return entries
    .filter((entry, index) => lastIndexById.get(entry.id) === index)
    .map(entry => {
      const parentId = entry.level > 0 ? folderIdsByLevel[entry.level - 1] : undefined
      folderIdsByLevel[entry.level] = entry.id
      folderIdsByLevel.length = entry.level + 1

      return { ...entry, parentId }
    })
}

export async function getDirectChildFolderReferences(
  articlePage: Page,
  parentId: string,
): Promise<EgainFolderReference[]> {
  const directChildren = (await getFolderTreeEntries(articlePage))
    .filter(entry => entry.parentId === parentId)
    .map(toFolderReference)

  return deduplicateFolderReferences(directChildren)
}

export function deduplicateFolderReferences(folders: EgainFolderReference[]): EgainFolderReference[] {
  return [...new Map(folders.map(folder => [folder.id, toFolderReference(folder)])).values()]
}

export function getFolderRowById(articlePage: Page, folderId: string): Locator {
  if (!/^[A-Za-z0-9_-]+$/.test(folderId)) {
    throw new FolderTreeStructureError(`Unsupported eGain folder ID: ${folderId}`)
  }

  return articlePage
    .locator(`[id="ic-dot-menu-${folderId}-context"]`)
    .locator('xpath=ancestor::tr[@data-testid="grid-body-row-folders"][1]')
    .filter({ visible: true })
    .last()
}

export async function resolveVisibleFolder(articlePage: Page, folder: EgainFolderReference): Promise<ResolvedFolder> {
  const row = getFolderRowById(articlePage, folder.id)
  const rowCount = await row.count()

  if (rowCount === 0) {
    throw new FolderTreeChangedError(`Folder "${folder.name}" is no longer visible in the eGain tree.`)
  }

  if (rowCount !== 1) {
    throw new FolderTreeStructureError(`Expected one folder "${folder.name}", but found ${rowCount}.`)
  }

  if (!(await row.isVisible())) {
    throw new FolderTreeChangedError(`Folder "${folder.name}" is currently hidden in the eGain tree.`)
  }

  return { folder, row }
}

export async function isFolderSelectionComplete(articlePage: Page, folderId: string): Promise<boolean> {
  if (getFolderIdFromUrl(articlePage.url()) !== folderId) {
    return false
  }

  const selectedEntries = (await getFolderTreeEntries(articlePage)).filter(entry => entry.selected)

  return selectedEntries.length === 1 && selectedEntries[0].id === folderId
}

export function getFolderIdFromUrl(value: string): string | undefined {
  try {
    const { pathname } = new URL(value)

    return pathname.match(/\/folder\/([^/]+)(?:\/create)?\/?$/)?.[1]
  } catch {
    return undefined
  }
}

export function toFolderReference(folder: EgainFolderReference): EgainFolderReference {
  return { id: folder.id, name: folder.name }
}
