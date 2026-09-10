import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { ArticleFlowProgressUpdate } from '../../../../shared/types/knowledgeworks'

/**
 * Tracks ArticleFlow's active, completed, and failed source paths.
 */
export function useImportProgress() {
  const activeSourcePathKey = ref<string | null>(null)
  const completedSourcePathKeys = ref<Set<string>>(new Set())
  const failedSourcePathKeys = ref<Set<string>>(new Set())
  let removeImportProgressListener: (() => void) | undefined

  onMounted(() => {
    removeImportProgressListener = window.articleflow.onImportProgress(handleImportProgress)
  })

  onBeforeUnmount(() => {
    removeImportProgressListener?.()
  })

  function handleImportProgress(progress: ArticleFlowProgressUpdate) {
    const pathKey = getSourcePathKey(progress.path)

    if (progress.status === 'started') {
      removeSourcePath(failedSourcePathKeys, pathKey)
      activeSourcePathKey.value = pathKey
      return
    }

    if (progress.status === 'created') {
      markSourcePathCreated(progress.path)
    } else if (progress.status === 'failed') {
      markSourcePathFailed(progress.path)
    } else {
      removeSourcePath(failedSourcePathKeys, pathKey)
    }

    if (activeSourcePathKey.value === pathKey) {
      activeSourcePathKey.value = null
    }
  }

  function markSourcePathCreated(path: string[]) {
    const pathKey = getSourcePathKey(path)
    const nextCompletedPaths = new Set(completedSourcePathKeys.value)

    nextCompletedPaths.add(pathKey)
    completedSourcePathKeys.value = nextCompletedPaths
    removeSourcePath(failedSourcePathKeys, pathKey)
  }

  function markSourcePathFailed(path: string[]) {
    markSourcePathKeyFailed(getSourcePathKey(path))
  }

  function markSourcePathKeyFailed(pathKey: string) {
    const nextFailedPaths = new Set(failedSourcePathKeys.value)

    nextFailedPaths.add(pathKey)
    failedSourcePathKeys.value = nextFailedPaths
  }

  function resetImportProgress() {
    activeSourcePathKey.value = null
    completedSourcePathKeys.value = new Set()
    failedSourcePathKeys.value = new Set()
  }

  return {
    activeSourcePathKey,
    completedSourcePathKeys,
    failedSourcePathKeys,
    markSourcePathCreated,
    markSourcePathKeyFailed,
    resetImportProgress,
  }
}

function removeSourcePath(pathKeys: Ref<Set<string>>, pathKey: string) {
  if (!pathKeys.value.has(pathKey)) {
    return
  }

  const nextPathKeys = new Set(pathKeys.value)

  nextPathKeys.delete(pathKey)
  pathKeys.value = nextPathKeys
}

function getSourcePathKey(path: string[]) {
  return JSON.stringify(path)
}
