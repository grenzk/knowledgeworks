<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import SourceStructureTree from './SourceStructureTree.vue'
import { useArticleFlowWorkflow } from './composables/useArticleFlowWorkflow.ts'

const {
  activeSourcePathKey,
  completedSourcePathKeys,
  completionAction,
  failedSourcePathKeys,
  handlePrimaryAction,
  handleSourceSelection,
  importPlan,
  isBusy,
  isSelectingRoot,
  openLogs,
  primaryActionButton,
  selectedArticleCount,
  selectedSourcePathKeys,
  selectCompletionAction,
  selectRoot,
  sourceFilePaths,
  sourceFolderName,
  statusIcon,
  statusMessage,
  statusTone,
} = useArticleFlowWorkflow()
const sourceTreeFrame = ref<HTMLElement | null>(null)

watch(activeSourcePathKey, async pathKey => {
  if (!pathKey) {
    return
  }

  await nextTick()
  sourceTreeFrame.value?.querySelector<HTMLElement>('[data-progress-state="active"]')?.scrollIntoView({
    block: 'nearest',
  })
})
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
