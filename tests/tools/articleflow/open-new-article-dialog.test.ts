import type { Page } from 'playwright'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSelectedFolderReference: vi.fn(),
  resolveVisibleFolder: vi.fn(),
  selectResolvedFolder: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  dialogWait: vi.fn(),
  inputWait: vi.fn(),
  inputValue: vi.fn(),
}))

vi.mock('../../../src/tools/articleflow/automation/folder-tree-navigation.ts', () => mocks)
vi.mock('../../../src/tools/articleflow/automation/folder-tree-state.ts', () => mocks)
vi.mock('../../../src/shared/egain/editor/get-article-editor-locators.ts', () => ({
  getArticlePageActionLocators: () => ({ createArticleButton: { click: mocks.create } }),
  getNewArticleDialogLocators: () => ({
    dialog: { waitFor: mocks.dialogWait, getByRole: () => ({ click: mocks.cancel }) },
    folderPathInput: { waitFor: mocks.inputWait, inputValue: mocks.inputValue },
  }),
}))

import { openNewArticleDialogInFolder } from '../../../src/tools/articleflow/automation/open-new-article-dialog.ts'

const page = {} as Page
const destination = { id: 'product-id', name: 'Sample Product', ancestorPath: [] }
const resolved = { folder: destination, row: {} }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getSelectedFolderReference.mockResolvedValue(destination)
  mocks.resolveVisibleFolder.mockResolvedValue(resolved)
  mocks.inputValue.mockResolvedValue('Sample Product')
})

describe('openNewArticleDialogInFolder', () => {
  it('reselects the destination by ID even when the tree already selects it', async () => {
    await openNewArticleDialogInFolder(page, 'Sample Product')

    expect(mocks.resolveVisibleFolder).toHaveBeenCalledWith(page, destination)
    expect(mocks.selectResolvedFolder).toHaveBeenCalledWith(page, resolved, undefined)
    expect(mocks.selectResolvedFolder.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    )
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('cancels a stale Archive dialog and reopens it in the product folder', async () => {
    mocks.inputValue.mockResolvedValueOnce('Archive').mockResolvedValueOnce('Sample Product')

    await openNewArticleDialogInFolder(page, 'Sample Product')

    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.selectResolvedFolder).toHaveBeenCalledTimes(2)
    expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[1])
  })

  it('closes the wrong dialog and fails after bounded retries', async () => {
    mocks.inputValue.mockResolvedValue('Archive')

    await expect(openNewArticleDialogInFolder(page, 'Sample Product')).rejects.toThrow(
      'but found "Archive" after 3 attempts',
    )
    expect(mocks.create).toHaveBeenCalledTimes(3)
    expect(mocks.cancel).toHaveBeenCalledTimes(3)
  })

  it('does not open a dialog if the selected folder is wrong', async () => {
    mocks.getSelectedFolderReference.mockResolvedValue({ ...destination, name: 'Archive' })

    await expect(openNewArticleDialogInFolder(page, 'Sample Product')).rejects.toThrow(
      'Expected the selected article destination',
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('stops before retrying after cancellation', async () => {
    const controller = new AbortController()
    mocks.inputValue.mockResolvedValue('Archive')
    mocks.cancel.mockImplementationOnce(async () => controller.abort())

    await expect(openNewArticleDialogInFolder(page, 'Sample Product', controller.signal)).rejects.toMatchObject({
      name: 'AutomationCancellationError',
    })
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.cancel).toHaveBeenCalledOnce()
  })
})
