import type { Locator, Page } from 'playwright'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const locatorMocks = vi.hoisted(() => ({
  getArticleListEntryLocators: vi.fn(),
  getArticleListLocators: vi.fn(),
}))

vi.mock('../../../src/shared/egain/editor/get-article-editor-locators.ts', () => locatorMocks)

import {
  collectExistingArticleTitles,
  openExistingArticleFromList,
} from '../../../src/tools/articleflow/automation/collect-existing-article-titles.ts'

type ArticlePageState = {
  currentPage: number
  idsByPage: Record<number, string[]>
  titlesByPage: Record<number, string[]>
}

beforeEach(() => {
  locatorMocks.getArticleListEntryLocators.mockReset()
  locatorMocks.getArticleListLocators.mockReset()
})

describe('collectExistingArticleTitles', () => {
  it('collects exact titles from every page and restores the first page', async () => {
    const state: ArticlePageState = {
      currentPage: 2,
      idsByPage: {
        1: ['ECV3-100', 'ECV3-101'],
        2: ['ECV3-102'],
      },
      titlesByPage: {
        1: ['Manuals', ' Specifications '],
        2: ['Manuals'],
      },
    }
    const firstPageClick = vi.fn(async () => {
      state.currentPage = 1
    })
    const nextPageClick = vi.fn(async () => {
      state.currentPage += 1
    })

    locatorMocks.getArticleListLocators.mockReturnValue({
      articleIds: createTextListLocator(() => state.idsByPage[state.currentPage]),
      currentPageInput: createSingleLocator({ inputValue: () => String(state.currentPage) }),
      emptyState: createSingleLocator({ isVisible: () => false }),
      firstPageButton: createSingleLocator({ click: firstPageClick }),
      nextPageButton: createSingleLocator({ click: nextPageClick }),
      titleLabels: createTextListLocator(() => state.titlesByPage[state.currentPage]),
      totalPagesLabel: createSingleLocator({ textContent: () => ' of 2' }),
    })

    const titles = await collectExistingArticleTitles(createPage())

    expect([...titles]).toEqual(['Manuals', 'Specifications'])
    expect(state.currentPage).toBe(1)
    expect(firstPageClick).toHaveBeenCalledTimes(2)
    expect(nextPageClick).toHaveBeenCalledTimes(1)
  })

  it('returns an empty set for an empty single-page article list', async () => {
    locatorMocks.getArticleListLocators.mockReturnValue({
      articleIds: createTextListLocator(() => []),
      currentPageInput: createSingleLocator({ isVisible: () => false }),
      emptyState: createSingleLocator({ isVisible: () => true }),
      firstPageButton: createSingleLocator(),
      nextPageButton: createSingleLocator(),
      titleLabels: createTextListLocator(() => []),
      totalPagesLabel: createSingleLocator({ isVisible: () => false }),
    })

    await expect(collectExistingArticleTitles(createPage())).resolves.toEqual(new Set())
  })

  it('waits for a stale article list to be replaced before collecting titles', async () => {
    let pollCount = 0
    const getTitles = () => (pollCount < 2 ? ['Root article'] : ['Manuals'])

    locatorMocks.getArticleListLocators.mockReturnValue({
      articleIds: createTextListLocator(() => (pollCount < 2 ? ['ECV3-100'] : ['ECV3-200'])),
      currentPageInput: createSingleLocator({ inputValue: () => '1' }),
      emptyState: createSingleLocator({ isVisible: () => false }),
      firstPageButton: createSingleLocator(),
      nextPageButton: createSingleLocator(),
      titleLabels: createTextListLocator(getTitles),
      totalPagesLabel: createSingleLocator({ textContent: () => ' of 1' }),
    })

    const titles = await collectExistingArticleTitles(
      createPage(() => {
        pollCount += 1
      }),
    )

    expect([...titles]).toEqual(['Manuals'])
  })

  it('retries when eGain replaces pagination controls while reading the list', async () => {
    let inputReadCount = 0

    locatorMocks.getArticleListLocators.mockReturnValue({
      articleIds: createTextListLocator(() => ['ECV3-200']),
      currentPageInput: createSingleLocator({
        inputValue: () => {
          inputReadCount += 1

          if (inputReadCount === 1) {
            throw new Error('Pagination control was replaced')
          }

          return '1'
        },
      }),
      emptyState: createSingleLocator({ isVisible: () => false }),
      firstPageButton: createSingleLocator(),
      nextPageButton: createSingleLocator(),
      titleLabels: createTextListLocator(() => ['Startup Procedures']),
      totalPagesLabel: createSingleLocator({ textContent: () => ' of 1' }),
    })

    await expect(collectExistingArticleTitles(createPage())).resolves.toEqual(new Set(['Startup Procedures']))
    expect(inputReadCount).toBeGreaterThan(1)
  })

  it('opens an exact-title article from a later article-list page', async () => {
    const state: ArticlePageState = {
      currentPage: 1,
      idsByPage: {
        1: ['ECV3-100'],
        2: ['ECV3-200'],
      },
      titlesByPage: {
        1: ['Overview'],
        2: ['Manuals'],
      },
    }
    const articleClick = vi.fn()
    const nextPageClick = vi.fn(async () => {
      state.currentPage += 1
    })
    const waitForURL = vi.fn()

    locatorMocks.getArticleListLocators.mockReturnValue({
      articleIds: createTextListLocator(() => state.idsByPage[state.currentPage]),
      currentPageInput: createSingleLocator({ inputValue: () => String(state.currentPage) }),
      emptyState: createSingleLocator({ isVisible: () => false }),
      firstPageButton: createSingleLocator(),
      nextPageButton: createSingleLocator({ click: nextPageClick }),
      titleLabels: createTextListLocator(() => state.titlesByPage[state.currentPage]),
      totalPagesLabel: createSingleLocator({ textContent: () => ' of 2' }),
    })
    locatorMocks.getArticleListEntryLocators.mockImplementation((_page, title) => ({
      cell: {
        click: articleClick,
        count: async () => (state.titlesByPage[state.currentPage].includes(title) ? 1 : 0),
        isVisible: async () => true,
        locator: () => ({
          getAttribute: async () => '202300000000200',
          locator: () => ({
            first: () => ({ getAttribute: async () => 'Draft' }),
          }),
        }),
      },
    }))

    const articlePage = {
      ...createPage(),
      waitForURL,
    } as unknown as Page

    await expect(openExistingArticleFromList(articlePage, 'Manuals')).resolves.toBe('checked-in')
    expect(nextPageClick).toHaveBeenCalledOnce()
    expect(articleClick).toHaveBeenCalledOnce()
    expect(waitForURL).toHaveBeenCalledWith(/\/article\/202300000000200\/?$/, expect.any(Object))
  })
})

function createPage(onWait?: () => void): Page {
  return {
    waitForTimeout: async () => {
      onWait?.()
    },
  } as unknown as Page
}

function createSingleLocator(
  overrides: {
    click?: () => Promise<void>
    inputValue?: () => Promise<string> | string
    isVisible?: () => Promise<boolean> | boolean
    textContent?: () => Promise<string | null> | string | null
  } = {},
): Locator {
  return {
    click: overrides.click ?? (async () => {}),
    count: async () => 1,
    inputValue: async () => overrides.inputValue?.() ?? '',
    isVisible: async () => overrides.isVisible?.() ?? true,
    textContent: async () => overrides.textContent?.() ?? '',
    waitFor: async () => {},
  } as Locator
}

function createTextListLocator(getValues: () => string[]): Locator {
  return {
    allTextContents: async () => getValues(),
  } as Locator
}
