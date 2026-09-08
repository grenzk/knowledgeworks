<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  ArticleFlowCompletionAction,
  ArticleFlowImportSelection,
  ArticleFlowImportPlan,
  ArticleFlowProgressUpdate,
  ArticleFlowRunResult,
} from '../../../shared/types/knowledgeworks'
import SourceStructureTree from './SourceStructureTree.vue'
import {
  buildSourceTree,
  createArticleImportSelection,
  createFullySelectedSourceTree,
  setSourceTreeNodeSelected,
} from './source-tree-selection.ts'

type ArticleFlowStatusTone = 'idle' | 'ready' | 'running' | 'success' | 'error'
type PrimaryActionButtonState = {
  disabled: boolean
  icon: string
  label: string
  severity?: 'danger'
}

const completionAction = ref<ArticleFlowCompletionAction>('check-in')
const importPlan = ref<ArticleFlowImportPlan | null>(null)
const isPreparingTemplate = ref(false)
const isSelectingRoot = ref(false)
const isRunning = ref(false)
const isStopping = ref(false)
const isTemplatePrepared = ref(false)
const statusMessage = ref('No source folder selected.')
const statusTone = ref<ArticleFlowStatusTone>('idle')
const activeSourcePathKey = ref<string | null>(null)
const completedSourcePathKeys = ref<Set<string>>(new Set())
const failedSourcePathKeys = ref<Set<string>>(new Set())
const selectedSourcePathKeys = ref<Set<string>>(new Set())
const sourceTreeFrame = ref<HTMLElement | null>(null)
let removeImportProgressListener: (() => void) | undefined

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
  const plan = importPlan.value

  if (!plan) {
    return { articlePaths: [], folderPaths: [] }
  }

  return createArticleImportSelection(plan, selectedSourcePathKeys.value)
})
const selectedArticleCount = computed(() => selectedImportScope.value.articlePaths.length)
const hasSelectedArticles = computed(() => selectedArticleCount.value > 0)
const isBusy = computed(() => isPreparingTemplate.value || isRunning.value)
const canPrepareTemplate = computed(
  () =>
    importPlan.value !== null &&
    hasSelectedArticles.value &&
    !isSelectingRoot.value &&
    !isBusy.value &&
    !isTemplatePrepared.value,
)
const canRun = computed(
  () =>
    importPlan.value !== null &&
    hasSelectedArticles.value &&
    !isSelectingRoot.value &&
    !isBusy.value &&
    isTemplatePrepared.value,
)
const primaryActionButton = computed<PrimaryActionButtonState>(() => {
  if (isStopping.value) {
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

onMounted(() => {
  removeImportProgressListener = window.articleflow.onImportProgress(handleImportProgress)
})

onBeforeUnmount(() => {
  removeImportProgressListener?.()
})

watch(activeSourcePathKey, async pathKey => {
  if (!pathKey) {
    return
  }

  await nextTick()
  sourceTreeFrame.value?.querySelector<HTMLElement>('[data-progress-state="active"]')?.scrollIntoView({
    block: 'nearest',
  })
})

/**
 * Opens the native directory picker and scans the selected taxonomy.
 */
async function selectRoot() {
  isSelectingRoot.value = true
  statusMessage.value = 'Reading source folder...'
  statusTone.value = 'running'

  try {
    const result = await window.articleflow.selectRoot()

    if (result.canceled) {
      statusMessage.value = importPlan.value ? 'Plan unchanged.' : 'No source folder selected.'
      statusTone.value = importPlan.value ? 'ready' : 'idle'
      return
    }

    if (!result.plan) {
      await reportRendererError(
        'Could not read the selected source folder.',
        'ArticleFlow did not return an import plan.',
      )
      setFailureStatus('Could not read the selected source folder.')
      return
    }

    importPlan.value = result.plan
    isTemplatePrepared.value = false
    selectedSourcePathKeys.value = createFullySelectedSourceTree(
      buildSourceTree(result.plan.folderPaths, getSourceFilePaths(result.plan)),
    )
    resetImportProgress()
    statusMessage.value = formatSelectionStatus(result.plan, result.plan.articles.length)
    statusTone.value = 'ready'
  } catch {
    setFailureStatus('Could not read the selected source folder.')
  } finally {
    isSelectingRoot.value = false
  }
}

/**
 * Creates or reuses the product root and opens its template article for the
 * user's one-time Custom Attributes setup.
 */
async function prepareTemplate() {
  const plan = importPlan.value

  if (!plan) {
    return
  }

  isPreparingTemplate.value = true
  statusMessage.value = 'Preparing the product template in eGain...'
  statusTone.value = 'running'

  try {
    const result = await window.articleflow.prepareTemplate(plan.rootPath)

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
      markSourcePathCreated([result.rootName])
    }

    statusMessage.value = 'Set custom attributes in eGain, press Done, then continue.'
    statusTone.value = 'ready'
  } catch {
    setFailureStatus('Template preparation failed.')
  } finally {
    isPreparingTemplate.value = false
  }
}

/**
 * Rebuilds and runs the selected plan against the current eGain folder.
 */
async function runImport() {
  const plan = importPlan.value

  if (!plan) {
    return
  }

  isRunning.value = true
  activeSourcePathKey.value = null
  statusMessage.value = 'Import in progress. See logs for details.'
  statusTone.value = 'running'

  try {
    const result = await window.articleflow.runImport(plan.rootPath, completionAction.value, selectedImportScope.value)

    setResultStatus(result)
  } catch (error) {
    if (activeSourcePathKey.value) {
      markSourcePathKeyFailed(activeSourcePathKey.value)
    }

    await reportRendererError('Import failed.', error)
    setFailureStatus('Import failed.')
  } finally {
    activeSourcePathKey.value = null
    isRunning.value = false
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
    await window.articleflow.cancelImport()
  } catch (error) {
    isStopping.value = false
    await reportRendererError('Could not stop the import.', error)
    setFailureStatus('Could not stop the import.')
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

function handleSourceSelection(pathKey: string, selected: boolean) {
  selectedSourcePathKeys.value = setSourceTreeNodeSelected(
    sourceTreeNodes.value,
    selectedSourcePathKeys.value,
    pathKey,
    selected,
  )

  if (!isBusy.value && importPlan.value) {
    statusMessage.value = formatSelectionStatus(importPlan.value, selectedArticleCount.value)
    statusTone.value = hasSelectedArticles.value ? 'ready' : 'idle'
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

function removeSourcePath(pathKeys: typeof failedSourcePathKeys, pathKey: string) {
  if (!pathKeys.value.has(pathKey)) {
    return
  }

  const nextPathKeys = new Set(pathKeys.value)

  nextPathKeys.delete(pathKey)
  pathKeys.value = nextPathKeys
}

function resetImportProgress() {
  activeSourcePathKey.value = null
  completedSourcePathKeys.value = new Set()
  failedSourcePathKeys.value = new Set()
}

function getSourcePathKey(path: string[]) {
  return JSON.stringify(path)
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

function formatSelectionStatus(plan: ArticleFlowImportPlan, selectedCount: number) {
  if (selectedCount === 0) {
    return 'Select at least one article to import.'
  }

  if (selectedCount === plan.articles.length) {
    return `${formatCount(selectedCount, 'article')} selected across ${formatCount(plan.folderPaths.length, 'folder')}.`
  }

  return `${selectedCount} of ${formatCount(plan.articles.length, 'article')} selected.`
}

function getSourceFilePaths(plan: ArticleFlowImportPlan) {
  const rootName = plan.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

  return plan.articles.map(article => [rootName, ...article.relativeSourcePath.split(/[\\/]/).filter(Boolean)])
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
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

function setFailureStatus(message: string, directToLogs = true) {
  statusMessage.value = directToLogs ? `${message} See logs.` : message
  statusTone.value = 'error'
}

async function reportRendererError(message: string, error: unknown) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)

  await window.knowledgeworks.writeLog('error', 'ArticleFlow', message, detail).catch(() => undefined)
}
</script>

<template>
  <main class="article-flow-shell app-dark">
    <div class="article-flow-titlebar" aria-hidden="true"></div>

    <header class="article-flow-header">
      <div class="article-flow-brand" aria-label="ArticleFlow">
        <span class="article-flow-mark" aria-hidden="true">AF</span>
        <h1>ArticleFlow</h1>
      </div>

      <Button
        v-tooltip.bottom="'Show logs'"
        class="article-flow-icon-button"
        icon="pi pi-code"
        severity="secondary"
        text
        aria-label="Show logs"
        @click="openLogs"
      />
    </header>

    <section class="article-flow-workspace">
      <section class="setup-section" aria-labelledby="import-setup-title">
        <h1 id="import-setup-title" class="section-title">
          <span class="compact-layout-only">Import setup</span>
          <span class="wide-layout-only">Import settings</span>
        </h1>

        <div class="setup-panel">
          <div class="setup-row source-row">
            <span class="setup-label">Source folder</span>
            <strong class="setup-value source-name" :title="importPlan?.rootPath">{{ sourceFolderName }}</strong>

            <Button
              class="choose-folder-button"
              icon="pi pi-folder-open"
              :label="importPlan ? 'Change folder' : 'Choose folder'"
              severity="secondary"
              outlined
              :loading="isSelectingRoot"
              :disabled="isBusy"
              @click="selectRoot"
            />
          </div>

          <div class="setup-row destination-row">
            <span class="setup-label">Destination</span>
            <strong class="setup-value">Current eGain folder</strong>
          </div>

          <div class="setup-row completion-row">
            <span id="completion-action-label" class="setup-label">Completion action</span>
            <div class="completion-control" role="radiogroup" aria-labelledby="completion-action-label">
              <button
                type="button"
                data-action="check-in"
                :aria-checked="completionAction === 'check-in'"
                :class="{ selected: completionAction === 'check-in' }"
                :tabindex="completionAction === 'check-in' ? 0 : -1"
                role="radio"
                :disabled="isBusy"
                @click="selectCompletionAction('check-in')"
                @keydown.down.prevent="selectCompletionAction('publish', $event)"
                @keydown.right.prevent="selectCompletionAction('publish', $event)"
              >
                Check in
              </button>
              <button
                type="button"
                data-action="publish"
                :aria-checked="completionAction === 'publish'"
                :class="{ selected: completionAction === 'publish' }"
                :tabindex="completionAction === 'publish' ? 0 : -1"
                role="radio"
                :disabled="isBusy"
                @click="selectCompletionAction('publish')"
                @keydown.left.prevent="selectCompletionAction('check-in', $event)"
                @keydown.up.prevent="selectCompletionAction('check-in', $event)"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="plan-section" aria-labelledby="source-structure-title">
        <div class="plan-heading">
          <h2 id="source-structure-title" class="section-title">Source structure</h2>

          <div class="plan-heading-actions">
            <div v-if="importPlan" class="plan-counts" aria-label="Source structure totals">
              <span
                ><strong>{{ importPlan.folderPaths.length }}</strong> folder{{
                  importPlan.folderPaths.length === 1 ? '' : 's'
                }}</span
              >
              <span
                ><strong>{{ importPlan.articles.length }}</strong> article{{
                  importPlan.articles.length === 1 ? '' : 's'
                }}</span
              >
              <span
                ><strong>{{ importPlan.ignoredPaths.length }}</strong> ignored</span
              >
            </div>

            <Button
              class="choose-folder-button wide-source-button"
              icon="pi pi-folder-open"
              :label="importPlan ? 'Change folder' : 'Choose folder'"
              severity="secondary"
              outlined
              :loading="isSelectingRoot"
              :disabled="isBusy"
              @click="selectRoot"
            />
          </div>
        </div>

        <p class="wide-source-path">
          <span class="wide-source-label">
            <span>Source folder</span>
            <span class="source-path-separator" aria-hidden="true"></span>
          </span>
          <strong :title="importPlan?.rootPath">{{ sourceFolderName }}</strong>
        </p>

        <div v-if="!importPlan" class="plan-empty">
          <i class="pi pi-folder-open" aria-hidden="true" />
          <span>No import plan loaded.</span>
        </div>

        <div v-else class="plan-content">
          <div class="plan-panel">
            <details class="plan-details source-details" open>
              <summary>
                <span class="summary-label">
                  <i class="pi pi-chevron-right detail-chevron" aria-hidden="true" />
                  <span>Folder hierarchy</span>
                </span>
                <strong class="selection-count">{{ selectedArticleCount }} selected</strong>
              </summary>
              <div ref="sourceTreeFrame" class="source-tree-frame">
                <SourceStructureTree
                  :active-path-key="activeSourcePathKey"
                  :completed-path-keys="completedSourcePathKeys"
                  :failed-path-keys="failedSourcePathKeys"
                  :file-paths="sourceFilePaths"
                  :folder-paths="importPlan.folderPaths"
                  :disabled="isBusy"
                  :selected-path-keys="selectedSourcePathKeys"
                  @select="handleSourceSelection"
                />
              </div>
            </details>
          </div>

          <details v-if="importPlan.ignoredPaths.length" class="plan-details ignored-details">
            <summary>
              <span class="summary-label">
                <i class="pi pi-chevron-right detail-chevron" aria-hidden="true" />
                <span>Ignored items</span>
              </span>
              <strong>{{ importPlan.ignoredPaths.length }}</strong>
            </summary>
            <ul>
              <li v-for="ignoredPath in importPlan.ignoredPaths" :key="ignoredPath">{{ ignoredPath }}</li>
            </ul>
          </details>
        </div>
      </section>
    </section>

    <footer class="article-flow-footer">
      <span class="article-flow-status" :class="statusTone" aria-live="polite">
        <i :class="statusIcon" aria-hidden="true" />
        <span>{{ statusMessage }}</span>
      </span>

      <Button
        class="run-import-button"
        :icon="primaryActionButton.icon"
        :label="primaryActionButton.label"
        :severity="primaryActionButton.severity"
        :disabled="primaryActionButton.disabled"
        @click="handlePrimaryAction"
      />
    </footer>
  </main>
</template>

<style scoped>
.article-flow-shell {
  display: grid;
  grid-template-rows: 36px 60px minmax(0, 1fr) 64px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--kw-text-light);
  background: var(--kw-quiet-surface);
}

.article-flow-titlebar {
  -webkit-app-region: drag;
  border-bottom: 1px solid var(--kw-border-subtle);
  background: var(--kw-canvas);
}

.article-flow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--kw-border-subtle);
  background: var(--kw-quiet-header);
}

.article-flow-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.article-flow-brand h1 {
  overflow: hidden;
  margin: 0;
  color: var(--kw-text-light);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.5rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-flow-mark {
  position: relative;
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--kw-text-light);
  border: 2px solid var(--kw-primary);
  border-radius: 8px;
  background: var(--kw-surface);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}

.article-flow-mark::after {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 4px;
  height: 4px;
  content: '';
  background: var(--kw-accent);
}

:deep(.article-flow-icon-button.p-button) {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  padding: 0;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
  border-radius: 8px;
  background: transparent;
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out;
}

:deep(.article-flow-icon-button.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-text-muted);
  background: var(--kw-surface-hover);
}

.article-flow-workspace {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 24px;
  scrollbar-color: var(--kw-border) var(--kw-quiet-surface);
}

.setup-section,
.plan-section {
  display: grid;
  gap: 12px;
}

.plan-section {
  margin-top: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--kw-text-light);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
}

.section-title::before {
  width: 3px;
  height: 16px;
  flex: 0 0 3px;
  border-radius: 1px;
  background: var(--kw-primary);
  content: '';
}

.wide-layout-only,
.wide-source-path,
:deep(.wide-source-button.p-button) {
  display: none;
}

.setup-panel,
.plan-panel,
.ignored-details {
  border: 1px solid var(--kw-border);
  border-radius: 10px;
  background: var(--kw-surface);
}

.setup-row {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr) auto;
  min-height: 58px;
  align-items: center;
  gap: 12px 16px;
  padding: 10px 16px;
}

.setup-row + .setup-row {
  border-top: 1px solid var(--kw-border-subtle);
}

.setup-label {
  color: var(--kw-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.125rem;
}

.setup-value {
  min-width: 0;
  color: var(--kw-text-light);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.125rem;
}

.destination-row .setup-value {
  grid-column: 2 / -1;
}

.source-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.plan-heading-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  margin-left: auto;
}

:deep(.choose-folder-button.p-button),
:deep(.run-import-button.p-button) {
  height: 44px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out,
    color 120ms ease-out;
}

:deep(.choose-folder-button.p-button) {
  min-width: 132px;
  color: var(--kw-text-light);
  border-color: var(--kw-border);
  background: transparent;
}

:deep(.choose-folder-button.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-text-muted);
  background: var(--kw-surface-hover);
}

.completion-control {
  grid-column: 2 / -1;
  justify-self: end;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(100%, 280px);
  overflow: hidden;
  border: 1px solid var(--kw-border);
  border-radius: 8px;
  background: var(--kw-surface);
}

.completion-control button {
  height: 44px;
  padding: 0 14px;
  color: var(--kw-text-muted);
  border: 0;
  background: transparent;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 120ms ease-out,
    background-color 120ms ease-out;
}

.completion-control button + button {
  border-left: 1px solid var(--kw-border);
}

.completion-control button:first-child {
  border-radius: 7px 0 0 7px;
}

.completion-control button:last-child {
  border-radius: 0 7px 7px 0;
}

.completion-control button:hover:not(:disabled) {
  color: var(--kw-text-light);
  background: var(--kw-surface-hover);
}

.completion-control button.selected {
  color: var(--kw-text-light);
  background: var(--kw-primary);
}

.completion-control button.selected:hover:not(:disabled) {
  background: var(--kw-primary-hover);
}

.completion-control button.selected:active:not(:disabled) {
  background: var(--kw-primary-pressed);
}

.completion-control button:disabled {
  cursor: default;
  opacity: 0.7;
}

.article-flow-shell :is(button, summary):focus-visible,
:deep(.article-flow-shell .p-button:focus-visible) {
  outline: 2px solid var(--kw-focus);
  outline-offset: 1px;
}

.completion-control button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 0;
  background: var(--kw-primary-hover);
  box-shadow: inset 0 0 0 2px var(--kw-focus);
}

.completion-control:has(button:focus-visible) button + button {
  border-left-color: transparent;
}

.plan-counts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: var(--kw-text-muted);
  font-size: 0.8125rem;
  line-height: 1.125rem;
}

.plan-counts span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.plan-counts span + span::before {
  width: 3px;
  height: 3px;
  flex: 0 0 3px;
  margin-right: 4px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.plan-counts strong {
  color: var(--kw-text-light);
  font-weight: 600;
}

.plan-empty {
  display: flex;
  min-height: 156px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0;
  color: var(--kw-text-disabled);
  border: 1px solid var(--kw-border);
  border-radius: 10px;
  background: var(--kw-surface);
  font-size: 0.8125rem;
}

.plan-empty.compact {
  min-height: 72px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.plan-content {
  display: grid;
  gap: 12px;
}

.plan-panel {
  overflow: hidden;
}

.ignored-details ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.source-tree-frame {
  padding: 0 16px 16px 48px;
}

.plan-details summary {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  color: var(--kw-text-light);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  transition: background-color 120ms ease-out;
}

.plan-details summary::-webkit-details-marker {
  display: none;
}

.plan-details summary:hover {
  background: var(--kw-surface-hover);
}

.summary-label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.detail-chevron {
  width: 12px;
  flex: 0 0 auto;
  color: var(--kw-text-muted);
  font-size: 0.6875rem;
  text-align: center;
  transition: transform 180ms ease-out;
}

.plan-details[open] .detail-chevron {
  transform: rotate(90deg);
}

.ignored-details {
  overflow: hidden;
}

.ignored-details summary > strong {
  color: var(--kw-text-light);
  font-size: 0.8125rem;
  font-weight: 600;
}

.source-details .selection-count {
  color: var(--kw-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.125rem;
  white-space: nowrap;
}

.ignored-details ul {
  display: grid;
  gap: 8px;
  padding: 0 16px 16px 48px;
  color: var(--kw-text-muted);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.ignored-details li {
  overflow-wrap: anywhere;
}

.ignored-details ul {
  padding-top: 12px;
  border-top: 1px solid var(--kw-border-subtle);
}

.article-flow-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 10px 24px;
  border-top: 1px solid var(--kw-border-subtle);
  background: var(--kw-canvas);
}

.article-flow-status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--kw-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.125rem;
}

.article-flow-status > i {
  width: 18px;
  flex: 0 0 auto;
  color: var(--kw-text-disabled);
  font-size: 1rem;
  text-align: center;
}

.article-flow-status > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-flow-status.ready > i,
.article-flow-status.running > i {
  color: var(--kw-focus);
}

.article-flow-status.success > i {
  color: var(--kw-success);
}

.article-flow-status.error > i {
  color: var(--kw-danger);
}

:deep(.run-import-button.p-button) {
  min-width: 140px;
  color: var(--kw-text-light);
  border-color: var(--kw-focus);
  background: var(--kw-primary);
}

:deep(.run-import-button.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-text-light);
  background: var(--kw-primary-hover);
}

:deep(.run-import-button.p-button:enabled:active) {
  border-color: var(--kw-primary-pressed);
  background: var(--kw-primary-pressed);
}

:deep(.run-import-button.p-button:disabled) {
  color: var(--kw-text-disabled);
  border-color: var(--kw-border);
  background: var(--kw-surface);
  opacity: 1;
}

:deep(.run-import-button .p-button-loading-icon) {
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  will-change: transform;
}

@media (min-width: 960px) {
  .article-flow-workspace {
    display: grid;
    grid-template-areas: 'plan setup';
    grid-template-columns: minmax(0, 1fr) 340px;
    padding: 0;
    overflow: hidden;
  }

  .plan-section,
  .setup-section {
    min-width: 0;
    min-height: 0;
    align-content: start;
    overflow-y: auto;
    scrollbar-color: var(--kw-border) var(--kw-quiet-surface);
  }

  .plan-section {
    grid-area: plan;
    margin-top: 0;
    padding: 20px 24px 24px;
  }

  .setup-section {
    grid-area: setup;
    padding: 20px;
    border-left: 1px solid var(--kw-border-subtle);
  }

  .compact-layout-only,
  .source-row {
    display: none;
  }

  .wide-layout-only {
    display: inline;
  }

  .plan-heading {
    display: grid;
    grid-template-columns: minmax(max-content, 1fr) max-content max-content;
  }

  .plan-heading-actions {
    display: contents;
  }

  .plan-counts {
    grid-column: 2;
    flex-wrap: nowrap;
  }

  :deep(.wide-source-button.p-button) {
    display: inline-flex;
    grid-column: 3;
  }

  .wide-source-path {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--kw-text-muted);
    font-size: 0.8125rem;
    line-height: 1.125rem;
  }

  .wide-source-label {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
  }

  .source-path-separator {
    width: 4px;
    height: 4px;
    flex: 0 0 4px;
    border-radius: 50%;
    background: currentColor;
  }

  .wide-source-path strong {
    overflow: hidden;
    color: var(--kw-text-light);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setup-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 14px 16px;
  }

  .destination-row {
    border-top: 0;
  }

  .setup-label,
  .setup-value,
  .destination-row .setup-value,
  .completion-control,
  .source-row :deep(.choose-folder-button.p-button) {
    grid-column: 1;
  }

  .source-row :deep(.choose-folder-button.p-button),
  .completion-control {
    width: 100%;
    justify-self: stretch;
  }

  .source-tree-frame {
    padding-top: 16px;
    padding-left: 32px;
  }
}

@media (max-width: 700px) {
  .article-flow-workspace {
    padding: 16px;
  }

  .plan-section {
    margin-top: 20px;
  }

  .setup-row {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 0;
    gap: 8px 12px;
    padding: 12px;
  }

  .setup-label {
    grid-column: 1 / -1;
  }

  .setup-value {
    grid-column: 1;
  }

  .source-row :deep(.choose-folder-button.p-button) {
    grid-column: 2;
    grid-row: 2;
  }

  .destination-row .setup-value,
  .completion-control {
    grid-column: 1 / -1;
  }

  .completion-control {
    width: 100%;
    justify-self: stretch;
    grid-template-columns: repeat(2, 1fr);
  }

  .article-flow-footer {
    grid-template-columns: minmax(0, 1fr) auto;
    padding-inline: 16px;
  }

  :deep(.run-import-button.p-button) {
    min-width: 128px;
  }

  .ignored-details ul {
    padding-left: 36px;
  }

  .source-tree-frame {
    padding-left: 36px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .article-flow-shell *,
  .article-flow-shell *::before,
  .article-flow-shell *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
