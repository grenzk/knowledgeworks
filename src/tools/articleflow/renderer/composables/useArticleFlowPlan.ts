import { computed, ref } from 'vue'
import type { ArticleFlowImportPlan, ArticleFlowImportSelection } from '../../../../shared/types/knowledgeworks'
import {
  buildSourceTree,
  createArticleImportSelection,
  createFullySelectedSourceTree,
  setSourceTreeNodeSelected,
} from '../source-tree-selection.ts'

type RootSelectionResult = { canceled: true; plan: null } | { canceled: false; plan: ArticleFlowImportPlan }

/**
 * Owns the selected filesystem root, import plan, and source-tree selection.
 */
export function useArticleFlowPlan() {
  const importPlan = ref<ArticleFlowImportPlan | null>(null)
  const isSelectingRoot = ref(false)
  const selectedSourcePathKeys = ref<Set<string>>(new Set())

  const sourceFolderName = computed(() => {
    const rootPath = importPlan.value?.rootPath

    return rootPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'No folder selected'
  })
  const sourceFilePaths = computed(
    () =>
      importPlan.value?.articles.map(article => [
        sourceFolderName.value,
        ...article.relativeSourcePath.split(/[\\/]/).filter(Boolean),
      ]) ?? [],
  )
  const sourceTreeNodes = computed(() => buildSourceTree(importPlan.value?.folderPaths ?? [], sourceFilePaths.value))
  const selectedImportScope = computed<ArticleFlowImportSelection>(() => {
    if (!importPlan.value) {
      return { articlePaths: [], folderPaths: [] }
    }

    return createArticleImportSelection(importPlan.value, selectedSourcePathKeys.value)
  })
  const selectedArticleCount = computed(() => selectedImportScope.value.articlePaths.length)
  const hasSelectedArticles = computed(() => selectedArticleCount.value > 0)

  async function selectRoot(): Promise<RootSelectionResult> {
    isSelectingRoot.value = true

    try {
      const result = await window.articleflow.selectRoot()

      if (result.canceled) {
        return { canceled: true, plan: null }
      }

      if (!result.plan) {
        throw new Error('ArticleFlow did not return an import plan.')
      }

      importPlan.value = result.plan
      selectedSourcePathKeys.value = createFullySelectedSourceTree(
        buildSourceTree(result.plan.folderPaths, getSourceFilePaths(result.plan)),
      )

      return { canceled: false, plan: result.plan }
    } finally {
      isSelectingRoot.value = false
    }
  }

  function selectSourcePath(pathKey: string, selected: boolean) {
    selectedSourcePathKeys.value = setSourceTreeNodeSelected(
      sourceTreeNodes.value,
      selectedSourcePathKeys.value,
      pathKey,
      selected,
    )
  }

  return {
    hasSelectedArticles,
    importPlan,
    isSelectingRoot,
    selectRoot,
    selectSourcePath,
    selectedArticleCount,
    selectedImportScope,
    selectedSourcePathKeys,
    sourceFilePaths,
    sourceFolderName,
    sourceTreeNodes,
  }
}

function getSourceFilePaths(plan: ArticleFlowImportPlan) {
  const rootName = plan.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

  return plan.articles.map(article => [rootName, ...article.relativeSourcePath.split(/[\\/]/).filter(Boolean)])
}
