import type { ArticleFlowImportPlan, ArticleFlowImportSelection } from '../../../shared/types/knowledgeworks'

export type SourceTreeNode = {
  children: SourceTreeNode[]
  kind: 'file' | 'folder'
  name: string
  path: string[]
}

export type SourceTreeSelectionState = 'checked' | 'mixed' | 'unchecked'

export function buildSourceTree(folderPaths: string[][], filePaths: string[][]): SourceTreeNode[] {
  const roots: SourceTreeNode[] = []

  for (const path of folderPaths) {
    addPath(roots, path, 'folder')
  }

  for (const path of filePaths) {
    addPath(roots, path, 'file')
  }

  return roots
}

export function createFullySelectedSourceTree(nodes: SourceTreeNode[]): Set<string> {
  return new Set(flattenSourceTree(nodes).map(getSourceTreeNodeKey))
}

export function createArticleImportSelection(
  plan: ArticleFlowImportPlan,
  selectedPathKeys: ReadonlySet<string>,
): ArticleFlowImportSelection {
  const rootName = plan.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

  return {
    articlePaths: plan.articles
      .filter(article => {
        const path = [rootName, ...article.relativeSourcePath.split(/[\\/]/).filter(Boolean)]

        return selectedPathKeys.has(getSourceTreeNodeKey({ kind: 'file', path }))
      })
      .map(article => article.relativeSourcePath),
    folderPaths: plan.folderPaths
      .filter(path => selectedPathKeys.has(getSourceTreeNodeKey({ kind: 'folder', path })))
      .map(path => [...path]),
  }
}

export function setSourceTreeNodeSelected(
  nodes: SourceTreeNode[],
  selectedPathKeys: ReadonlySet<string>,
  targetPathKey: string,
  selected: boolean,
): Set<string> {
  const targetNode = flattenSourceTree(nodes).find(node => getSourceTreeNodeKey(node) === targetPathKey)

  if (!targetNode) {
    return new Set(selectedPathKeys)
  }

  const nextSelectedPathKeys = new Set(selectedPathKeys)

  for (const node of flattenSourceTree([targetNode])) {
    const pathKey = getSourceTreeNodeKey(node)

    if (selected) {
      nextSelectedPathKeys.add(pathKey)
    } else {
      nextSelectedPathKeys.delete(pathKey)
    }
  }

  normalizeFolderSelection(nodes, nextSelectedPathKeys)

  return nextSelectedPathKeys
}

export function getSourceTreeSelectionState(
  node: SourceTreeNode,
  selectedPathKeys: ReadonlySet<string>,
): SourceTreeSelectionState {
  if (selectedPathKeys.has(getSourceTreeNodeKey(node))) {
    return 'checked'
  }

  const hasSelectedDescendant = flattenSourceTree(node.children).some(descendant =>
    selectedPathKeys.has(getSourceTreeNodeKey(descendant)),
  )

  return hasSelectedDescendant ? 'mixed' : 'unchecked'
}

export function getSourceTreeNodeKey(node: Pick<SourceTreeNode, 'kind' | 'path'>): string {
  return `${node.kind}:${JSON.stringify(node.path)}`
}

function addPath(roots: SourceTreeNode[], path: string[], leafKind: SourceTreeNode['kind']) {
  let siblings = roots
  const currentPath: string[] = []

  for (const [index, name] of path.entries()) {
    currentPath.push(name)

    const kind = index === path.length - 1 ? leafKind : 'folder'
    let node = siblings.find(candidate => candidate.name === name && candidate.kind === kind)

    if (!node) {
      node = { children: [], kind, name, path: [...currentPath] }
      siblings.push(node)
    }

    siblings = node.children
  }
}

function flattenSourceTree(nodes: SourceTreeNode[]): SourceTreeNode[] {
  return nodes.flatMap(node => [node, ...flattenSourceTree(node.children)])
}

function normalizeFolderSelection(nodes: SourceTreeNode[], selectedPathKeys: Set<string>): boolean {
  return nodes.every(node => {
    const pathKey = getSourceTreeNodeKey(node)

    if (node.kind === 'file' || node.children.length === 0) {
      return selectedPathKeys.has(pathKey)
    }

    const allChildrenSelected = normalizeFolderSelection(node.children, selectedPathKeys)

    if (allChildrenSelected) {
      selectedPathKeys.add(pathKey)
    } else {
      selectedPathKeys.delete(pathKey)
    }

    return allChildrenSelected
  })
}
