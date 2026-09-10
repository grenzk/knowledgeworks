import { describe, expect, it } from 'vitest'
import type { ArticleImportPlan } from '../../../src/tools/articleflow/automation/create-import-plan.ts'
import { scopeArticleImportPlan } from '../../../src/tools/articleflow/automation/scope-import-plan.ts'

const plan: ArticleImportPlan = {
  articles: [
    {
      folderPath: ['Product', 'Manuals'],
      relativeSourcePath: 'Manuals/Guide.htm',
      sourcePath: '/source/Product/Manuals/Guide.htm',
      title: 'Guide',
    },
    {
      folderPath: ['Product', 'Specifications'],
      relativeSourcePath: 'Specifications/Power.htm',
      sourcePath: '/source/Product/Specifications/Power.htm',
      title: 'Power',
    },
  ],
  folderPaths: [
    ['Product'],
    ['Product', 'Manuals'],
    ['Product', 'Specifications'],
    ['Product', 'Specifications', 'Empty'],
  ],
  ignoredPaths: ['Notes.txt'],
  rootPath: '/source/Product',
}

describe('scopeArticleImportPlan', () => {
  it('includes explicitly selected folders and articles with their required ancestors', () => {
    const result = scopeArticleImportPlan(plan, {
      articlePaths: ['Specifications/Power.htm'],
      folderPaths: [
        ['Product', 'Specifications'],
        ['Product', 'Specifications', 'Empty'],
      ],
    })

    expect(result.articles.map(article => article.title)).toEqual(['Power'])
    expect(result.folderPaths).toEqual([
      ['Product'],
      ['Product', 'Specifications'],
      ['Product', 'Specifications', 'Empty'],
    ])
    expect(result.rootPath).toBe(plan.rootPath)
  })

  it('includes only a selected article and its ancestor folders', () => {
    const result = scopeArticleImportPlan(plan, {
      articlePaths: ['Manuals/Guide.htm'],
      folderPaths: [],
    })

    expect(result.articles.map(article => article.title)).toEqual(['Guide'])
    expect(result.folderPaths).toEqual([['Product'], ['Product', 'Manuals']])
  })

  it('preserves the original plan order and removes duplicate selections', () => {
    const result = scopeArticleImportPlan(plan, {
      articlePaths: ['Specifications/Power.htm', 'Manuals/Guide.htm'],
      folderPaths: [
        ['Product', 'Manuals'],
        ['Product', 'Manuals'],
      ],
    })

    expect(result.articles.map(article => article.title)).toEqual(['Guide', 'Power'])
    expect(result.folderPaths).toEqual([['Product'], ['Product', 'Manuals'], ['Product', 'Specifications']])
  })

  it('does not include unselected articles beneath a selected folder', () => {
    const result = scopeArticleImportPlan(plan, {
      articlePaths: [],
      folderPaths: [['Product', 'Manuals']],
    })

    expect(result.articles).toEqual([])
    expect(result.folderPaths).toEqual([['Product'], ['Product', 'Manuals']])
  })

  it('rejects article selections that are no longer in the filesystem plan', () => {
    expect(() =>
      scopeArticleImportPlan(plan, {
        articlePaths: ['Manuals/Missing.htm'],
        folderPaths: [],
      }),
    ).toThrow('The selected article is no longer available')
  })

  it('rejects folder selections that are no longer in the filesystem plan', () => {
    expect(() =>
      scopeArticleImportPlan(plan, {
        articlePaths: [],
        folderPaths: [['Product', 'Missing']],
      }),
    ).toThrow('The selected folder is no longer available')
  })
})
