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
