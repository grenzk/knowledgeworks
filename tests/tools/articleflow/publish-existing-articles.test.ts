import type { Locator, Page } from 'playwright'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticleImportPlan } from '../../../src/tools/articleflow/automation/create-import-plan.ts'

const articleListMocks = vi.hoisted(() => ({
  openExistingArticleFromList: vi.fn(),
}))
const editModeMocks = vi.hoisted(() => ({
  ensureArticleEditMode: vi.fn(),
}))
const folderMocks = vi.hoisted(() => ({
  getSelectedFolderReference: vi.fn(),
  selectFolderPath: vi.fn(),
}))
const locatorMocks = vi.hoisted(() => ({
  getArticlePageActionLocators: vi.fn(),
  getPublishSummaryDialogLocators: vi.fn(),
}))

vi.mock('../../../src/tools/articleflow/automation/collect-existing-article-titles.ts', () => articleListMocks)
vi.mock('../../../src/tools/articleflow/automation/ensure-article-edit-mode.ts', () => editModeMocks)
vi.mock('../../../src/tools/articleflow/automation/ensure-folder-path.ts', () => folderMocks)
vi.mock('../../../src/shared/egain/editor/get-article-editor-locators.ts', () => locatorMocks)

import {
  publishExistingArticles,
  type ExistingArticlePublishProgress,
} from '../../../src/tools/articleflow/automation/publish-existing-articles.ts'

const plan: ArticleImportPlan = {
  articles: [
    {
      folderPath: ['Sample Product', 'Manuals'],
      relativeSourcePath: 'Manuals/Installation.htm',
      sourcePath: '/tmp/Sample Product/Manuals/Installation.htm',
      title: 'Installation',
    },
  ],
  folderPaths: [['Sample Product'], ['Sample Product', 'Manuals']],
  ignoredPaths: [],
  rootPath: '/tmp/Sample Product',
}

beforeEach(() => {
  vi.clearAllMocks()
  folderMocks.getSelectedFolderReference.mockResolvedValue({
    ancestorPath: [],
    id: 'product-root',
    name: 'Sample Product',
  })
  folderMocks.selectFolderPath.mockResolvedValue(undefined)
  articleListMocks.openExistingArticleFromList.mockResolvedValue('checked-in')
  editModeMocks.ensureArticleEditMode.mockResolvedValue(undefined)
})

describe('publishExistingArticles', () => {
  it('publishes a checked-in article and waits for read-only mode', async () => {
    const progress: ExistingArticlePublishProgress[] = []
    let editVisibilityCheckCount = 0
    const editArticleButton = createLocator({
      isVisible: async () => {
        editVisibilityCheckCount += 1
        return editVisibilityCheckCount > 1
      },
    })
    const saveArticleButton = createLocator({ isVisible: async () => false })
    const publishArticleButton = createLocator()
    const publishDialog = createLocator()
    const publishDoneButton = createLocator()

    setLocatorMocks(editArticleButton, saveArticleButton, publishArticleButton, publishDialog, publishDoneButton)

    const result = await publishExistingArticles(createPage(), plan, {
      onProgress: update => progress.push(update),
    })

    expect(result.publishedArticles).toEqual(plan.articles)
    expect(result.failedArticles).toEqual([])
    expect(editModeMocks.ensureArticleEditMode).toHaveBeenCalledOnce()
    expect(publishArticleButton.click).toHaveBeenCalledOnce()
    expect(publishDoneButton.click).toHaveBeenCalledOnce()
    expect(editVisibilityCheckCount).toBeGreaterThan(1)
    expect(progress).toEqual([
      { article: plan.articles[0], status: 'started' },
      { article: plan.articles[0], status: 'published' },
    ])
  })

  it('skips an article whose list icon identifies it as published', async () => {
    articleListMocks.openExistingArticleFromList.mockResolvedValue('published')
    const publishArticleButton = createLocator()

    setLocatorMocks(createLocator(), createLocator(), publishArticleButton, createLocator(), createLocator())

    const result = await publishExistingArticles(createPage(), plan)

    expect(result.alreadyPublishedArticles).toEqual(plan.articles)
    expect(result.publishedArticles).toEqual([])
    expect(editModeMocks.ensureArticleEditMode).not.toHaveBeenCalled()
    expect(publishArticleButton.click).not.toHaveBeenCalled()
  })

  it('reports a missing exact-title article without entering edit mode', async () => {
    articleListMocks.openExistingArticleFromList.mockResolvedValue(null)
    setLocatorMocks(createLocator(), createLocator(), createLocator(), createLocator(), createLocator())

    const result = await publishExistingArticles(createPage(), plan)

    expect(result.missingArticles).toEqual(plan.articles)
    expect(editModeMocks.ensureArticleEditMode).not.toHaveBeenCalled()
  })

  it('reports a checked-out article without attempting publication', async () => {
    articleListMocks.openExistingArticleFromList.mockResolvedValue('checked-out')
    const publishArticleButton = createLocator()

    setLocatorMocks(createLocator(), createLocator(), publishArticleButton, createLocator(), createLocator())

    const result = await publishExistingArticles(createPage(), plan)

    expect(result.unavailableArticles).toEqual([
      {
        article: plan.articles[0],
        message: 'Article is checked out and must be checked in before publishing.',
      },
    ])
    expect(publishArticleButton.click).not.toHaveBeenCalled()
  })

  it('continues with later articles after one article fails', async () => {
    const secondArticle = {
      ...plan.articles[0],
      relativeSourcePath: 'Manuals/Service.htm',
      sourcePath: '/tmp/Sample Product/Manuals/Service.htm',
      title: 'Service',
    }
    const twoArticlePlan = {
      ...plan,
      articles: [plan.articles[0], secondArticle],
    }

    articleListMocks.openExistingArticleFromList
      .mockRejectedValueOnce(new Error('Article list was rerendered.'))
      .mockResolvedValueOnce(null)
    setLocatorMocks(createLocator(), createLocator(), createLocator(), createLocator(), createLocator())

    const result = await publishExistingArticles(createPage(), twoArticlePlan)

    expect(result.failedArticles).toEqual([
      {
        article: plan.articles[0],
        message: 'Article list was rerendered.',
      },
    ])
    expect(result.missingArticles).toEqual([secondArticle])
    expect(articleListMocks.openExistingArticleFromList).toHaveBeenCalledTimes(2)
  })
})

function setLocatorMocks(
  editArticleButton: Locator,
  saveArticleButton: Locator,
  publishArticleButton: Locator,
  dialog: Locator,
  doneButton: Locator,
) {
  locatorMocks.getArticlePageActionLocators.mockReturnValue({
    editArticleButton,
    publishArticleButton,
    saveArticleButton,
  })
  locatorMocks.getPublishSummaryDialogLocators.mockReturnValue({ dialog, doneButton })
}

function createPage(): Page {
  return {
    waitForTimeout: vi.fn(),
  } as unknown as Page
}

function createLocator(
  overrides: {
    isVisible?: () => Promise<boolean> | boolean
  } = {},
): Locator {
  return {
    click: vi.fn(),
    count: vi.fn().mockResolvedValue(1),
    isEnabled: vi.fn().mockResolvedValue(true),
    isVisible: vi.fn(overrides.isVisible ?? (async () => true)),
    waitFor: vi.fn(),
  } as unknown as Locator
}
