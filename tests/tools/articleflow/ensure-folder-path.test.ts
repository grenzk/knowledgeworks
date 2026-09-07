import { describe, expect, it, vi } from 'vitest'
import {
  deduplicateFolderReferences,
  ensureFolderPath,
  getSelectedFolderReference,
  type EgainFolderReference,
  type EgainImportParent,
  type FolderTraversalCache,
} from '../../../src/tools/articleflow/automation/ensure-folder-path.ts'
import type { Page } from 'playwright'
import {
  isFolderSelectionComplete,
  normalizeFolderTreeEntries,
} from '../../../src/tools/articleflow/automation/folder-tree-state.ts'

type FolderTreeEntryFixture = EgainFolderReference & {
  level: number
  parentId?: string
  selected: boolean
}

function createFolderTreePage(entries: FolderTreeEntryFixture[]): Page {
  const visibleFolderRows = {
    evaluateAll: vi.fn().mockResolvedValue(entries),
  }
  const folderRows = {
    filter: vi.fn().mockReturnValue(visibleFolderRows),
  }
  const activeLoaders = {
    count: vi.fn().mockResolvedValue(0),
  }

  return {
    locator: vi.fn((selector: string) => (selector.includes('loader') ? activeLoaders : folderRows)),
    url: () => 'https://example.test/folder/manuals',
  } as unknown as Page
}

describe('deduplicateFolderReferences', () => {
  it('collapses duplicate DOM entries that represent the same eGain folder', () => {
    const folders: EgainFolderReference[] = [
      { id: 'folder-1', name: 'Manuals' },
      { id: 'folder-1', name: 'Manuals' },
      { id: 'folder-2', name: 'Drawings' },
    ]

    expect(deduplicateFolderReferences(folders)).toEqual([
      { id: 'folder-1', name: 'Manuals' },
      { id: 'folder-2', name: 'Drawings' },
    ])
  })

  it('does not collapse different folder IDs that happen to share a name', () => {
    const folders: EgainFolderReference[] = [
      { id: 'folder-1', name: 'Manuals' },
      { id: 'folder-2', name: 'Manuals' },
    ]

    expect(deduplicateFolderReferences(folders)).toEqual(folders)
  })
})

describe('ensureFolderPath', () => {
  it('does not traverse a folder path that was already confirmed during the import', async () => {
    const importParent: EgainImportParent = { ancestorPath: [], id: 'archive', name: 'Zzz Archive' }
    const cache: FolderTraversalCache = new Map([
      [JSON.stringify(['Sample Product']), { id: 'product', name: 'Sample Product' }],
    ])

    await expect(ensureFolderPath({} as Page, importParent, ['Sample Product'], undefined, cache)).resolves.toBe(false)

    expect(cache.get(JSON.stringify([]))).toEqual({ id: 'archive', name: 'Zzz Archive' })
  })
})

describe('getSelectedFolderReference', () => {
  it('uses the final occurrence of a duplicated selected row and its actual ancestors', async () => {
    const articlePage = createFolderTreePage([
      { id: 'archive', level: 0, name: 'Archive', selected: false },
      { id: 'manuals', level: 1, name: 'Manuals', selected: true },
      { id: 'product', level: 1, name: 'Sample Product', selected: false },
      { id: 'manuals', level: 2, name: 'Manuals', selected: true },
    ])

    await expect(getSelectedFolderReference(articlePage)).resolves.toEqual({
      ancestorPath: [
        { id: 'archive', name: 'Archive' },
        { id: 'product', name: 'Sample Product' },
      ],
      id: 'manuals',
      name: 'Manuals',
    })
    await expect(isFolderSelectionComplete(articlePage, 'manuals')).resolves.toBe(true)
  })

  it('does not let a stale duplicate supply ancestry to other rows', () => {
    const entries = normalizeFolderTreeEntries([
      { id: 'archive', level: 0, name: 'Archive', selected: false },
      { id: 'product', level: 1, name: 'Product', selected: false },
      { id: 'manuals', level: 1, name: 'Manuals', selected: true },
      { id: 'other', level: 2, name: 'Other', selected: false },
      { id: 'manuals', level: 2, name: 'Manuals', selected: true },
    ])

    expect(entries.find(entry => entry.id === 'other')?.parentId).toBe('product')
    expect(entries.filter(entry => entry.id === 'manuals')).toHaveLength(1)
  })

  it('returns the selected folder with its visible ancestor path', async () => {
    const articlePage = createFolderTreePage([
      { id: 'archive', level: 0, name: 'Zzz Archive', selected: false },
      { id: 'product', level: 1, name: 'Sample Product', parentId: 'archive', selected: false },
      { id: 'manuals', level: 2, name: 'Manuals', parentId: 'product', selected: true },
    ])

    await expect(getSelectedFolderReference(articlePage)).resolves.toEqual({
      ancestorPath: [
        { id: 'archive', name: 'Zzz Archive' },
        { id: 'product', name: 'Sample Product' },
      ],
      id: 'manuals',
      name: 'Manuals',
    })
  })

  it('rejects an ambiguous folder selection', async () => {
    const articlePage = createFolderTreePage([
      { id: 'archive', level: 0, name: 'Zzz Archive', selected: true },
      { id: 'product', level: 1, name: 'Sample Product', parentId: 'archive', selected: true },
    ])

    await expect(getSelectedFolderReference(articlePage)).rejects.toThrow(
      'Expected one selected eGain folder, but found 2.',
    )
  })
})
