import type { ArticleImportPlan } from './create-import-plan.ts'

export type ArticleImportSelection = {
  articlePaths: string[]
  folderPaths: string[][]
}

/**
 * Restricts an import plan to selected folders and articles while retaining the
 * ancestor folders required to recreate their destination paths.
 */
export function scopeArticleImportPlan(plan: ArticleImportPlan, selection: ArticleImportSelection): ArticleImportPlan {
  const availableArticlePaths = new Set(plan.articles.map(article => article.relativeSourcePath))
  const availableFolderKeys = new Set(plan.folderPaths.map(getPathKey))
  const selectedArticlePaths = new Set(selection.articlePaths)
  const selectedFolderPaths = deduplicatePaths(selection.folderPaths)

  for (const articlePath of selectedArticlePaths) {
    if (!availableArticlePaths.has(articlePath)) {
      throw new Error(`The selected article is no longer available: ${articlePath}`)
    }
  }

  for (const folderPath of selectedFolderPaths) {
    if (!availableFolderKeys.has(getPathKey(folderPath))) {
      throw new Error(`The selected folder is no longer available: ${folderPath.join(' > ')}`)
    }
  }

  const articles = plan.articles.filter(article => selectedArticlePaths.has(article.relativeSourcePath))
  const requiredFolderKeys = new Set<string>()

  for (const folderPath of selectedFolderPaths) {
    addPathAndAncestors(requiredFolderKeys, folderPath)
  }

  for (const article of articles) {
    addPathAndAncestors(requiredFolderKeys, article.folderPath)
  }

  return {
    articles,
    folderPaths: plan.folderPaths.filter(folderPath => requiredFolderKeys.has(getPathKey(folderPath))),
    ignoredPaths: [],
    rootPath: plan.rootPath,
  }
}

function addPathAndAncestors(pathKeys: Set<string>, path: string[]) {
  for (let length = 1; length <= path.length; length += 1) {
    pathKeys.add(getPathKey(path.slice(0, length)))
  }
}

function deduplicatePaths(paths: string[][]) {
  const uniquePaths = new Map(paths.map(path => [getPathKey(path), path]))

  return [...uniquePaths.values()]
}

function getPathKey(path: string[]) {
  return JSON.stringify(path)
}
