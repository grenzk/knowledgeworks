<script setup lang="ts">
import { useMediaLinking } from './composables/useMediaLinking.ts'
import { useToolbarActions } from './composables/useToolbarActions.ts'

const toolbarActions = useToolbarActions()
const { currentMessage, errorMessage, isBusy, reportActionError, showProgressDots } = toolbarActions
const {
  chooseLinkingType,
  doneTargetCount,
  isCountingTargets,
  isLinkingTypeMenuOpen,
  isRunningMediaLinking,
  isStoppingTargetCount,
  isStoppingMediaLinking,
  linkingOptions,
  refreshTargetCount,
  runMediaLinking,
  selectedLinkingType,
  selectedLinkingTypeConfig,
  stopMediaLinking,
  stopTargetCount,
  targetCount,
  targetLabel,
  targetSingularLabel,
  toggleLinkingTypeMenu,
  unlinkedTargetCount,
} = useMediaLinking(toolbarActions)

function closeToolbar() {
  window.mediabridge.closeToolbar()
}

function minimizeToolbar() {
  window.mediabridge.minimizeToolbar()
}

async function openLogs() {
  try {
    await window.mediabridge.openLogs()
  } catch (error) {
    await reportActionError('Logs', error)
  }
}
</script>

<template>
  <main class="toolbar-shell app-dark">
    <section class="toolbar" aria-label="MediaBridge toolbar">
      <div class="brand" aria-label="MediaBridge">
        <span class="brand-mark">MB</span>
      </div>

      <button
        v-tooltip.bottom="isCountingTargets ? 'Stop counting' : `Refresh ${targetSingularLabel} count`"
        class="target-counter"
        :class="{ 'stop-state': isCountingTargets }"
        type="button"
        :disabled="isStoppingTargetCount || (isBusy && !isCountingTargets)"
        :aria-label="isCountingTargets ? 'Stop counting targets' : `Refresh ${targetSingularLabel} count`"
        @click="isCountingTargets ? stopTargetCount() : refreshTargetCount()"
      >
        <template v-if="isCountingTargets">
          <i class="pi pi-stop action-state-icon" aria-hidden="true" />
          <span class="action-state-label">Stop</span>
        </template>
        <template v-else>
          <span class="counter-number">{{ targetCount ?? '--' }}</span>
          <span class="counter-label">{{ targetLabel }}</span>
        </template>
      </button>

      <div
        v-tooltip.bottom="isRunningMediaLinking ? 'Stop automation' : `Run ${selectedLinkingTypeConfig.label}`"
        class="run-control"
        :class="{ open: isLinkingTypeMenuOpen }"
      >
        <button
          class="run-button"
          type="button"
          :disabled="isStoppingMediaLinking || (isBusy && !isRunningMediaLinking)"
          :aria-label="isRunningMediaLinking ? 'Stop link automation' : 'Run selected link automation'"
          @click="isRunningMediaLinking ? stopMediaLinking() : runMediaLinking()"
        >
          <i
            class="action-state-icon"
            :class="isRunningMediaLinking ? 'pi pi-stop' : 'pi pi-play'"
            aria-hidden="true"
          />
          <span class="action-state-label">{{ isRunningMediaLinking ? 'Stop' : 'Run' }}</span>
        </button>

        <button
          class="run-mode-button"
          type="button"
          aria-label="Select link automation type"
          :aria-expanded="isLinkingTypeMenuOpen"
          :disabled="isBusy"
          @click="toggleLinkingTypeMenu"
        >
          <i class="pi pi-chevron-down run-chevron" aria-hidden="true" />
        </button>
      </div>

      <div class="divider" aria-hidden="true" />

      <Button
        v-tooltip.bottom="'Show logs'"
        icon="pi pi-code"
        severity="secondary"
        text
        aria-label="Show logs"
        @click="openLogs"
      />

      <Button
        v-tooltip.bottom="'Minimize toolbar'"
        icon="pi pi-minus"
        severity="secondary"
        text
        aria-label="Minimize toolbar"
        @click="minimizeToolbar"
      />

      <Button
        v-tooltip.bottom="'Close toolbar'"
        class="close-button"
        icon="pi pi-times"
        severity="secondary"
        text
        aria-label="Close toolbar"
        @click="closeToolbar"
      />
    </section>

    <section class="status-panel" :class="{ error: errorMessage }" aria-live="polite">
      <div v-if="isLinkingTypeMenuOpen" class="linking-type-menu" role="listbox" aria-label="Link automation type">
        <button
          v-for="option in linkingOptions"
          :key="option.value"
          class="linking-type-option"
          :class="{ selected: option.value === selectedLinkingType }"
          type="button"
          role="option"
          :aria-selected="option.value === selectedLinkingType"
          :disabled="option.disabled"
          @click="chooseLinkingType(option)"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-else-if="currentMessage" class="status-message">
        <span>{{ currentMessage }}</span>
        <span v-if="showProgressDots" class="progress-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>

      <div v-if="!isLinkingTypeMenuOpen" class="status-tray">
        <dl class="status-metrics">
          <div>
            <dt>Found</dt>
            <dd>{{ unlinkedTargetCount ?? '--' }}</dd>
          </div>
          <div>
            <dt>Done</dt>
            <dd>{{ doneTargetCount ?? '--' }}</dd>
          </div>
        </dl>
      </div>
    </section>
  </main>
</template>

<style scoped>
.toolbar-shell {
  display: grid;
  grid-template-rows: 60px 32px;
  gap: 8px;
  width: 100vw;
  height: 100vh;
  padding: 6px;
  color: var(--kw-text-light);
  border: 2px solid var(--kw-border-subtle);
  border-radius: 18px;
  background: var(--kw-quiet-surface);
}

.toolbar {
  -webkit-app-region: drag;
  display: grid;
  grid-template-columns: minmax(48px, 1fr) 116px 104px 1px 40px 40px 40px;
  align-items: center;
  gap: 5px;
  height: 60px;
  padding: 8px;
  border: 1px solid var(--kw-border);
  border-radius: 10px;
  background: var(--kw-quiet-header);
}

.toolbar :is(button, :deep(.p-button)) {
  -webkit-app-region: no-drag;
}

.toolbar > :is(button, :deep(.p-button)):focus-visible {
  outline: 2px solid var(--kw-focus);
  outline-offset: 1px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}

.brand-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--kw-text-light);
  border: 2px solid var(--kw-primary);
  border-radius: 8px;
  background: var(--kw-surface);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}

.brand-mark::after {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 4px;
  height: 4px;
  content: '';
  background: var(--kw-accent);
}

.toolbar :deep(.p-button) {
  width: 40px;
  height: 40px;
  color: var(--kw-text-light) !important;
  border: 1px solid var(--kw-border) !important;
  border-radius: 8px;
  background: var(--kw-surface) !important;
}

.toolbar :deep(.p-button),
.run-button,
.target-counter {
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
}

.toolbar :deep(.p-button .p-button-label) {
  font-weight: inherit;
}

.toolbar :deep(.p-button:hover) {
  border-color: var(--kw-text-muted) !important;
  background: var(--kw-surface-hover) !important;
}

.toolbar :deep(.close-button:hover),
.toolbar :deep(.close-button:focus-visible) {
  border-color: var(--kw-danger) !important;
}

.run-control {
  -webkit-app-region: no-drag;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 41px;
  width: 104px;
  height: 38px;
  overflow: hidden;
  border: 1px solid var(--kw-focus);
  border-radius: 8px;
  background: var(--kw-primary);
}

.run-control button:focus-visible {
  outline: 0;
  background: var(--kw-primary-hover);
  box-shadow: inset 0 0 0 2px var(--kw-focus);
}

.run-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  padding: 0 5px;
  color: var(--kw-text-light);
  border: 0;
  border-radius: 7px 0 0 7px;
  background: transparent;
  cursor: pointer;
}

.run-button:hover {
  background: var(--kw-primary-hover);
}

.run-button:active {
  background: var(--kw-primary-pressed);
}

.run-button:disabled,
.run-mode-button:disabled {
  cursor: default;
  opacity: 0.72;
}

.run-mode-button {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  place-items: center;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  color: var(--kw-text-light);
  border: 0;
  border-left: 1px solid var(--kw-focus);
  border-radius: 0 7px 7px 0;
  outline: none;
  background: transparent;
  cursor: pointer;
}

.run-mode-button:hover {
  background: var(--kw-primary-hover);
}

.run-mode-button:active {
  background: var(--kw-primary-pressed);
}

.run-chevron {
  color: var(--kw-text-light);
  font-size: 0.72rem;
  pointer-events: none;
  transition: transform 140ms ease;
}

.run-control.open .run-chevron {
  transform: rotate(180deg);
}

.target-counter {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 40px;
  padding: 0 8px;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
  border-radius: 8px;
  background: var(--kw-surface);
  cursor: pointer;
}

.target-counter:hover {
  border-color: var(--kw-focus);
  background: var(--kw-surface-hover);
}

.target-counter:hover .counter-label {
  color: var(--kw-text-light);
}

.target-counter:hover .counter-number {
  border-color: var(--kw-focus);
}

.target-counter:disabled {
  cursor: default;
  opacity: 0.72;
}

.target-counter.stop-state {
  grid-template-columns: auto auto;
  justify-content: center;
  gap: 8px;
  color: var(--kw-danger);
  border-color: var(--kw-danger);
}

.target-counter.stop-state:hover {
  border-color: var(--kw-danger);
}

.action-state-icon {
  display: grid;
  place-items: center;
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  font-size: 12px;
  line-height: 12px;
}

.action-state-icon::before {
  line-height: 12px;
}

.action-state-label {
  display: inline-flex;
  align-items: center;
  height: 14px;
  line-height: 14px;
}

.counter-number {
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 28px;
  padding: 0 7px;
  color: var(--kw-focus);
  border: 1px solid var(--kw-primary);
  border-radius: 6px;
  background: var(--kw-canvas);
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1;
}

.counter-label {
  overflow: hidden;
  color: var(--kw-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}

.divider {
  width: 1px;
  height: 30px;
  background: var(--kw-border);
}

.status-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  align-items: center;
  gap: 10px;
  height: 32px;
  padding: 0 10px;
  color: var(--kw-text-muted);
  border: 1px solid var(--kw-border-subtle);
  border-radius: 8px;
  background: var(--kw-canvas);
}

.status-message {
  display: flex;
  min-width: 0;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 650;
  white-space: nowrap;
}

.status-message span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-dots {
  display: inline-grid;
  grid-template-columns: repeat(3, 0.45em);
  flex: 0 0 auto;
  margin-left: 1px;
  color: var(--kw-text-light);
}

.progress-dots span {
  animation: progress-dot 1.2s infinite ease-in-out;
  opacity: 0.28;
}

.progress-dots span:nth-child(2) {
  animation-delay: 0.16s;
}

.progress-dots span:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes progress-dot {
  0%,
  70%,
  100% {
    opacity: 0.28;
    transform: translateY(0);
  }

  35% {
    opacity: 1;
    transform: translateY(-1px);
  }
}

.linking-type-menu {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.linking-type-option {
  display: grid;
  place-items: center;
  height: 20px;
  min-width: 44px;
  padding: 0 8px;
  color: var(--kw-text-muted);
  border: 1px solid var(--kw-border);
  border-radius: 6px;
  background: var(--kw-surface);
  font-size: 0.67rem;
  font-weight: 750;
  line-height: 1;
  cursor: pointer;
}

.linking-type-option:hover {
  color: var(--kw-text-light);
  background: var(--kw-surface-hover);
}

.linking-type-option.selected {
  color: var(--kw-text-light);
  border-color: var(--kw-focus);
  background: var(--kw-primary);
}

.linking-type-option:disabled {
  color: var(--kw-text-disabled);
  border-color: var(--kw-border-subtle);
  background: var(--kw-canvas);
  cursor: default;
}

.status-tray {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-metrics {
  display: flex;
  margin: 0;
  gap: 6px;
}

.status-metrics div {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 4px;
  min-width: 48px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--kw-border-subtle);
  border-radius: 6px;
  background: var(--kw-surface);
}

.status-metrics dt,
.status-metrics dd {
  margin: 0;
  font-size: 0.67rem;
  font-weight: 750;
  line-height: 1;
}

.status-metrics dt {
  color: var(--kw-text-muted);
}

.status-metrics dd {
  color: var(--kw-text-light);
}

.status-panel.error {
  color: var(--kw-danger);
}
</style>
