import { computed, nextTick, ref } from 'vue'
import type {
  ArticleFlowCompletionAction,
  ArticleFlowImportPlan,
  ArticleFlowPublishResult,
  ArticleFlowRunResult,
} from '../../../../shared/types/knowledgeworks'
import { useImportPlan } from './useImportPlan.ts'
import { useImportProgress } from './useImportProgress.ts'

export type ArticleFlowStatusTone = 'idle' | 'ready' | 'running' | 'success' | 'error'

type ActionButtonState = {
  disabled: boolean
  icon: string
  label: string
  severity?: 'danger'
}

/**
 * Coordinates ArticleFlow's plan, template, import, cancellation, and status workflows.
 */
export function useImportWorkflow() {
  const plan = useImportPlan()
  const progress = useImportProgress()
  const completionAction = ref<ArticleFlowCompletionAction>('check-in')
  const isPreparingTemplate = ref(false)
  const isRunning = ref(false)
  const isPublishingExisting = ref(false)
  const isStopping = ref(false)
  const isTemplatePrepared = ref(false)
  const statusMessage = ref('No source folder selected.')
  const statusTone = ref<ArticleFlowStatusTone>('idle')

  const isBusy = computed(() => isPreparingTemplate.value || isRunning.value || isPublishingExisting.value)
  const canPrepareTemplate = computed(
    () =>
      plan.importPlan.value !== null &&
      plan.hasSelectedArticles.value &&
      !plan.isSelectingRoot.value &&
      !isBusy.value &&
      !isTemplatePrepared.value,
  )
  const canRun = computed(
    () =>
      plan.importPlan.value !== null &&
      plan.hasSelectedArticles.value &&
      !plan.isSelectingRoot.value &&
      !isBusy.value &&
      isTemplatePrepared.value,
  )
  const primaryActionButton = computed<ActionButtonState>(() => {
    if (isRunning.value && isStopping.value) {
      return {
        disabled: true,
        icon: 'pi pi-stop',
        label: 'Stopping...',
        severity: 'danger',
      }
    }

    if (isRunning.value) {
      return {
        disabled: false,
        icon: 'pi pi-stop',
        label: 'Stop import',
        severity: 'danger',
      }
    }

    if (isPreparingTemplate.value) {
      return {
        disabled: true,
        icon: 'pi pi-spinner pi-spin',
        label: 'Preparing...',
      }
    }

    if (isTemplatePrepared.value) {
      return {
        disabled: !canRun.value,
        icon: 'pi pi-play',
        label: 'Import selected',
      }
    }

    return {
      disabled: !canPrepareTemplate.value,
      icon: 'pi pi-file-edit',
      label: 'Prepare template',
    }
  })
  const publishActionButton = computed<ActionButtonState>(() => {
    if (isPublishingExisting.value) {
      return {
        disabled: isStopping.value,
        icon: 'pi pi-stop',
        label: isStopping.value ? 'Stopping...' : 'Stop publishing',
        severity: 'danger',
      }
    }

    return {
      disabled:
        plan.importPlan.value === null || !plan.hasSelectedArticles.value || plan.isSelectingRoot.value || isBusy.value,
      icon: 'pi pi-upload',
      label: 'Publish checked-in',
    }
  })
  const statusIcon = computed(() => {
    const icons: Record<ArticleFlowStatusTone, string> = {
      error: 'pi pi-exclamation-circle',
      idle: 'pi pi-circle',
      ready: 'pi pi-file-check',
      running: 'pi pi-spinner pi-spin',
      success: 'pi pi-check-circle',
    }

    return icons[statusTone.value]
  })

  /**
   * Opens the native directory picker and scans the selected taxonomy.
   */
  async function selectRoot() {
    statusMessage.value = 'Reading source folder...'
    statusTone.value = 'running'

    try {
      const result = await plan.selectRoot()

      if (result.canceled) {
        statusMessage.value = plan.importPlan.value ? 'Plan unchanged.' : 'No source folder selected.'
        statusTone.value = plan.importPlan.value ? 'ready' : 'idle'
        return
      }

      isTemplatePrepared.value = false
      progress.resetImportProgress()
      statusMessage.value = formatSelectionStatus(result.plan, result.plan.articles.length)
      statusTone.value = 'ready'
    } catch (error) {
      await reportRendererError('Could not read the selected source folder.', error)
      setFailureStatus('Could not read the selected source folder.')
    }
  }

  /**
   * Creates or reuses the product root and opens its template article for the
   * user's one-time Custom Attributes setup.
   */
  async function prepareTemplate() {
    const importPlan = plan.importPlan.value

    if (!importPlan) {
      return
    }

    isPreparingTemplate.value = true
    statusMessage.value = 'Preparing the product template in eGain...'
    statusTone.value = 'running'

    try {
      const result = await window.articleflow.prepareTemplate(importPlan.rootPath)

      if (result.canceled) {
        statusMessage.value = 'Template preparation canceled.'
        statusTone.value = 'ready'
        return
      }

      if (!result.ok) {
        await reportRendererError('Template preparation failed.', 'ArticleFlow returned an unsuccessful result.')
        setFailureStatus('Template preparation failed.')
        return
      }

      isTemplatePrepared.value = true

      if (result.rootCreated) {
        progress.markSourcePathCreated([result.rootName])
      }

      statusMessage.value = 'Set custom attributes in eGain, press Done, then continue.'
      statusTone.value = 'ready'
    } catch (error) {
      await reportRendererError('Template preparation failed.', error)
      setFailureStatus('Template preparation failed.')
    } finally {
      isPreparingTemplate.value = false
    }
  }

  /**
   * Rebuilds and runs the selected plan against the current eGain folder.
   */
  async function runImport() {
    const importPlan = plan.importPlan.value

    if (!importPlan) {
      return
    }

    isRunning.value = true
    progress.activeSourcePathKey.value = null
    statusMessage.value = 'Import in progress. See logs for details.'
    statusTone.value = 'running'

    try {
      const result = await window.articleflow.runImport(
        importPlan.rootPath,
        completionAction.value,
        plan.selectedImportScope.value,
      )

      setResultStatus(result)
    } catch (error) {
      if (progress.activeSourcePathKey.value) {
        progress.markSourcePathKeyFailed(progress.activeSourcePathKey.value)
      }

      await reportRendererError('Import failed.', error)
      setFailureStatus('Import failed.')
    } finally {
      progress.activeSourcePathKey.value = null
      isRunning.value = false
      isStopping.value = false
    }
  }

  /**
   * Publishes checked-in articles that match the selected local source entries.
   */
  async function publishExisting() {
    const importPlan = plan.importPlan.value

    if (!importPlan) {
      return
    }

    isPublishingExisting.value = true
    progress.resetImportProgress()
    statusMessage.value = 'Publishing checked-in articles. See logs for details.'
    statusTone.value = 'running'

    try {
      const result = await window.articleflow.publishExisting(importPlan.rootPath, plan.selectedImportScope.value)

      setPublishResultStatus(result)
    } catch (error) {
      if (progress.activeSourcePathKey.value) {
        progress.markSourcePathKeyFailed(progress.activeSourcePathKey.value)
      }

      await reportRendererError('Publishing failed.', error)
      setFailureStatus('Publishing failed.')
    } finally {
      progress.activeSourcePathKey.value = null
      isPublishingExisting.value = false
      isStopping.value = false
    }
  }

  /**
   * Requests a cooperative stop after ArticleFlow finishes its current eGain operation.
   */
  async function stopImport() {
    if (!isRunning.value || isStopping.value) {
      return
    }

    isStopping.value = true
    statusMessage.value = 'Stopping import after the current operation...'
    statusTone.value = 'running'

    try {
      await window.articleflow.cancelOperation()
    } catch (error) {
      isStopping.value = false
      await reportRendererError('Could not stop the import.', error)
      setFailureStatus('Could not stop the import.')
    }
  }

  async function stopPublishing() {
    if (!isPublishingExisting.value || isStopping.value) {
      return
    }

    isStopping.value = true
    statusMessage.value = 'Stopping publishing after the current operation...'
    statusTone.value = 'running'

    try {
      await window.articleflow.cancelOperation()
    } catch (error) {
      isStopping.value = false
      await reportRendererError('Could not stop publishing.', error)
      setFailureStatus('Could not stop publishing.')
    }
  }

  /**
   * Opens or focuses the shared KnowledgeWorks log window.
   */
  async function openLogs() {
    try {
      await window.knowledgeworks.openLogs()
    } catch (error) {
      await reportRendererError('Could not open the log window.', error)
      setFailureStatus('Could not open the log window.', false)
    }
  }

  function handlePrimaryAction() {
    if (isRunning.value) {
      void stopImport()
      return
    }

    if (isTemplatePrepared.value) {
      void runImport()
      return
    }

    void prepareTemplate()
  }

  function handlePublishAction() {
    if (isPublishingExisting.value) {
      void stopPublishing()
      return
    }

    void publishExisting()
  }

  function handleSourceSelection(pathKey: string, selected: boolean) {
    plan.selectSourcePath(pathKey, selected)

    if (!isBusy.value && plan.importPlan.value) {
      statusMessage.value = formatSelectionStatus(plan.importPlan.value, plan.selectedArticleCount.value)
      statusTone.value = plan.hasSelectedArticles.value ? 'ready' : 'idle'
    }
  }

  function selectCompletionAction(action: ArticleFlowCompletionAction, event?: KeyboardEvent) {
    const control = event ? (event.currentTarget as HTMLElement).parentElement : null

    completionAction.value = action

    if (control) {
      void nextTick(() => {
        control.querySelector<HTMLElement>(`[data-action="${action}"]`)?.focus()
      })
    }
  }

  function setResultStatus(result: ArticleFlowRunResult) {
    if (result.canceled) {
      statusMessage.value = `Import stopped. ${formatCount(result.createdArticleCount, 'article')} completed.`
      statusTone.value = 'ready'
      return
    }

    const action = completionAction.value === 'check-in' ? 'checked in' : 'published'
    const parts = [`${formatCount(result.createdArticleCount, 'article')} ${action}`]

    if (result.existingArticleCount > 0) {
      parts.push(`${formatCount(result.existingArticleCount, 'article')} already existed`)
    }

    if (!result.ok) {
      parts.push(`${formatCount(result.failedArticles.length, 'article')} failed`)
      statusMessage.value = `${parts.join('; ')}. See logs.`
      statusTone.value = 'error'
      return
    }

    statusMessage.value = `${parts.join('; ')}.`
    statusTone.value = 'success'
  }

  function setPublishResultStatus(result: ArticleFlowPublishResult) {
    if (result.canceled) {
      statusMessage.value = `Publishing stopped. ${formatCount(result.publishedArticleCount, 'article')} published.`
      statusTone.value = 'ready'
      return
    }

    const parts = [`${formatCount(result.publishedArticleCount, 'article')} published`]

    if (result.alreadyPublishedArticleCount > 0) {
      parts.push(`${formatCount(result.alreadyPublishedArticleCount, 'article')} already published`)
    }

    const issueCount = result.issues.length

    if (!result.ok) {
      parts.push(`${formatCount(issueCount, 'article')} not published`)
      statusMessage.value = `${parts.join('; ')}. See logs.`
      statusTone.value = 'error'
      return
    }

    statusMessage.value = `${parts.join('; ')}.`
    statusTone.value = 'success'
  }

  function setFailureStatus(message: string, directToLogs = true) {
    statusMessage.value = directToLogs ? `${message} See logs.` : message
    statusTone.value = 'error'
  }

  return {
    activeSourcePathKey: progress.activeSourcePathKey,
    completedSourcePathKeys: progress.completedSourcePathKeys,
    completionAction,
    failedSourcePathKeys: progress.failedSourcePathKeys,
    handlePrimaryAction,
    handlePublishAction,
    handleSourceSelection,
    importPlan: plan.importPlan,
    isBusy,
    isSelectingRoot: plan.isSelectingRoot,
    openLogs,
    primaryActionButton,
    publishActionButton,
    selectedArticleCount: plan.selectedArticleCount,
    selectedSourcePathKeys: plan.selectedSourcePathKeys,
    selectCompletionAction,
    selectRoot,
    sourceFilePaths: plan.sourceFilePaths,
    sourceFolderName: plan.sourceFolderName,
    statusIcon,
    statusMessage,
    statusTone,
  }
}

function formatSelectionStatus(plan: ArticleFlowImportPlan, selectedCount: number) {
  if (selectedCount === 0) {
    return 'Select at least one article to import.'
  }

  if (selectedCount === plan.articles.length) {
    return `${formatCount(selectedCount, 'article')} selected across ${formatCount(plan.folderPaths.length, 'folder')}.`
  }

  return `${selectedCount} of ${formatCount(plan.articles.length, 'article')} selected.`
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

async function reportRendererError(message: string, error: unknown) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)

  await window.knowledgeworks.writeLog('error', 'ArticleFlow', message, detail).catch(() => undefined)
}
