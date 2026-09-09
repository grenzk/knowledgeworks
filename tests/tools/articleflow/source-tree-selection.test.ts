import { describe, expect, it } from 'vitest'
import {
  buildSourceTree,
  createArticleImportSelection,
  createFullySelectedSourceTree,
  getSourceTreeNodeKey,
  getSourceTreeSelectionState,
  setSourceTreeNodeSelected,
} from '../../../src/tools/articleflow/renderer/source-tree-selection.ts'

const nodes = buildSourceTree(
  [['Product'], ['Product', 'Manuals'], ['Product', 'Specifications'], ['Product', 'Empty']],
  [
    ['Product', 'Manuals', 'Guide.htm'],
    ['Product', 'Specifications', 'Power.htm'],
  ],
)

describe('source tree selection', () => {
  it('selects every node by default', () => {
    const selection = createFullySelectedSourceTree(nodes)

    expect(getSourceTreeSelectionState(nodes[0], selection)).toBe('checked')
    expect(selection.size).toBe(6)
  })

  it('deselects a folder and all of its descendants', () => {
    const initialSelection = createFullySelectedSourceTree(nodes)
    const manuals = nodes[0].children.find(node => node.name === 'Manuals')!
    const selection = setSourceTreeNodeSelected(nodes, initialSelection, getSourceTreeNodeKey(manuals), false)

    expect(getSourceTreeSelectionState(manuals, selection)).toBe('unchecked')
    expect(getSourceTreeSelectionState(nodes[0], selection)).toBe('mixed')
  })

  it('restores parent selection after every child is selected', () => {
    const rootKey = getSourceTreeNodeKey(nodes[0])
    let selection = setSourceTreeNodeSelected(nodes, createFullySelectedSourceTree(nodes), rootKey, false)

    for (const child of nodes[0].children) {
      selection = setSourceTreeNodeSelected(nodes, selection, getSourceTreeNodeKey(child), true)
    }

    expect(getSourceTreeSelectionState(nodes[0], selection)).toBe('checked')
  })

  it('updates later sibling folders when an earlier sibling is partially selected', () => {
    const manuals = nodes[0].children.find(node => node.name === 'Manuals')!
    const specifications = nodes[0].children.find(node => node.name === 'Specifications')!
    const guide = manuals.children[0]
    const power = specifications.children[0]
    let selection = createFullySelectedSourceTree(nodes)

    selection = setSourceTreeNodeSelected(nodes, selection, getSourceTreeNodeKey(guide), false)
    selection = setSourceTreeNodeSelected(nodes, selection, getSourceTreeNodeKey(power), false)

    expect(getSourceTreeSelectionState(manuals, selection)).toBe('mixed')
    expect(getSourceTreeSelectionState(specifications, selection)).toBe('mixed')
    expect(getSourceTreeSelectionState(guide, selection)).toBe('unchecked')
    expect(getSourceTreeSelectionState(power, selection)).toBe('unchecked')
  })

  it('keeps a folder selected when its article is deselected', () => {
    const manuals = nodes[0].children.find(node => node.name === 'Manuals')!
    const guide = manuals.children[0]
    const selection = setSourceTreeNodeSelected(
      nodes,
      createFullySelectedSourceTree(nodes),
      getSourceTreeNodeKey(guide),
      false,
    )
    const importSelection = createArticleImportSelection(
      {
        articles: [
          {
            folderPath: ['Product', 'Manuals'],
            relativeSourcePath: 'Manuals/Guide.htm',
            sourcePath: '/source/Product/Manuals/Guide.htm',
            title: 'Guide',
          },
        ],
        folderPaths: [['Product'], ['Product', 'Manuals']],
        ignoredPaths: [],
        rootPath: '/source/Product',
      },
      selection,
    )

    expect(getSourceTreeSelectionState(manuals, selection)).toBe('mixed')
    expect(importSelection.folderPaths).toContainEqual(['Product', 'Manuals'])
    expect(importSelection.articlePaths).toEqual([])
  })

  it('leaves the selection unchanged for an unknown node', () => {
    const initialSelection = createFullySelectedSourceTree(nodes)
    const selection = setSourceTreeNodeSelected(nodes, initialSelection, 'folder:["Missing"]', false)

    expect(selection).toEqual(initialSelection)
  })

  it('creates a plain IPC-safe import selection', () => {
    const selection = createFullySelectedSourceTree(nodes)
    const importSelection = createArticleImportSelection(
      {
        articles: [
          {
            folderPath: ['Product', 'Manuals'],
            relativeSourcePath: 'Manuals/Guide.htm',
            sourcePath: '/source/Product/Manuals/Guide.htm',
            title: 'Guide',
          },
        ],
        folderPaths: [['Product'], ['Product', 'Manuals']],
        ignoredPaths: [],
        rootPath: '/source/Product',
      },
      selection,
    )

    expect(importSelection).toEqual({
      articlePaths: ['Manuals/Guide.htm'],
      folderPaths: [['Product'], ['Product', 'Manuals']],
    })
    expect(structuredClone(importSelection)).toEqual(importSelection)
  })
})
