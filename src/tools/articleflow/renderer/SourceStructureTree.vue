<script setup lang="ts">
import { computed } from 'vue'
import {
  buildSourceTree,
  getSourceTreeNodeKey,
  getSourceTreeSelectionState as resolveSourceTreeSelectionState,
  type SourceTreeNode,
} from './source-tree-selection.ts'

const props = defineProps<{
  activePathKey?: string | null
  completedPathKeys?: ReadonlySet<string>
  depth?: number
  disabled?: boolean
  failedPathKeys?: ReadonlySet<string>
  filePaths?: string[][]
  folderPaths?: string[][]
  nodes?: SourceTreeNode[]
  selectedPathKeys?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  select: [pathKey: string, selected: boolean]
}>()

const currentDepth = computed(() => props.depth ?? 0)
const treeNodes = computed(() => props.nodes ?? buildSourceTree(props.folderPaths ?? [], props.filePaths ?? []))

function getNodeProgressState(node: SourceTreeNode): 'active' | 'completed' | 'failed' | undefined {
  const pathKey = JSON.stringify(node.path)

  if (props.activePathKey === pathKey) {
    return 'active'
  }

  if (props.completedPathKeys?.has(pathKey)) {
    return 'completed'
  }

  if (props.failedPathKeys?.has(pathKey)) {
    return 'failed'
  }
}

function handleSelectionChange(node: SourceTreeNode, event: Event) {
  emit('select', getSourceTreeNodeKey(node), (event.currentTarget as HTMLInputElement).checked)
}

function getNodeSelectionState(node: SourceTreeNode) {
  return resolveSourceTreeSelectionState(node, props.selectedPathKeys ?? new Set())
}
</script>

<template>
  <ul class="structure-tree" :class="{ root: currentDepth === 0 }">
    <li v-for="node in treeNodes" :key="node.path.join('/')" class="structure-tree-node">
      <label
        class="structure-tree-row"
        :class="getNodeProgressState(node)"
        :data-progress-state="getNodeProgressState(node)"
        :aria-current="getNodeProgressState(node) === 'active' ? 'true' : undefined"
        :title="node.path.join(' > ')"
      >
        <input
          class="structure-tree-checkbox"
          type="checkbox"
          :checked="getNodeSelectionState(node) === 'checked'"
          :indeterminate="getNodeSelectionState(node) === 'mixed'"
          :disabled="disabled"
          :aria-label="`Include ${node.name}`"
          @change="handleSelectionChange(node, $event)"
        />
        <i
          class="pi structure-tree-node-icon"
          :class="node.kind === 'file' ? 'pi-file' : currentDepth === 0 ? 'pi-folder-open' : 'pi-folder'"
          aria-hidden="true"
        />
        <span>{{ node.name }}</span>
        <i
          v-if="getNodeProgressState(node) === 'active'"
          class="pi pi-spinner pi-spin structure-tree-status"
          aria-label="In progress"
        />
        <i
          v-else-if="getNodeProgressState(node) === 'completed'"
          class="pi pi-check structure-tree-status"
          aria-label="Created"
        />
        <i
          v-else-if="getNodeProgressState(node) === 'failed'"
          class="pi pi-times structure-tree-status"
          aria-label="Not created"
        />
      </label>

      <SourceStructureTree
        v-if="node.children.length"
        :active-path-key="activePathKey"
        :completed-path-keys="completedPathKeys"
        :depth="currentDepth + 1"
        :disabled="disabled"
        :failed-path-keys="failedPathKeys"
        :nodes="node.children"
        :selected-path-keys="selectedPathKeys"
        @select="(pathKey, selected) => emit('select', pathKey, selected)"
      />
    </li>
  </ul>
</template>

<style scoped>
.structure-tree {
  margin: 0;
  padding: 0;
  list-style: none;
}

.structure-tree:not(.root) {
  margin-left: 8px;
  padding-left: 20px;
  border-left: 1px solid var(--kw-border-subtle);
}

.structure-tree-node {
  position: relative;
}

.structure-tree:not(.root) > .structure-tree-node::before {
  position: absolute;
  top: 14px;
  left: -20px;
  width: 14px;
  border-top: 1px solid var(--kw-border-subtle);
  content: '';
}

.structure-tree:not(.root) > .structure-tree-node:last-child::after {
  position: absolute;
  top: 15px;
  bottom: 0;
  left: -21px;
  width: 2px;
  background: var(--kw-surface);
  content: '';
}

.structure-tree-row {
  display: flex;
  min-width: 0;
  min-height: 28px;
  align-items: center;
  gap: 8px;
  padding: 2px 6px;
  color: var(--kw-text-muted);
  border-radius: 4px;
  font-size: 0.8125rem;
  line-height: 1.25rem;
  transition:
    color 120ms ease-out,
    background-color 120ms ease-out;
}

.structure-tree-row:has(.structure-tree-checkbox:not(:disabled)) {
  cursor: pointer;
}

.structure-tree-checkbox {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin: 0;
  appearance: none;
  place-content: center;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
  border-radius: 3px;
  background: var(--kw-canvas);
  cursor: pointer;
}

.structure-tree-checkbox::before {
  color: currentColor;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
  content: '';
}

.structure-tree-checkbox:checked,
.structure-tree-checkbox:indeterminate {
  border-color: var(--kw-primary);
  background: var(--kw-primary);
}

.structure-tree-checkbox:checked::before {
  content: '\2713';
}

.structure-tree-checkbox:indeterminate::before {
  width: 7px;
  border-top: 2px solid currentColor;
}

.structure-tree-checkbox:disabled {
  cursor: default;
  opacity: 0.55;
}

.structure-tree-checkbox:focus-visible {
  outline: 2px solid var(--kw-focus);
  outline-offset: 2px;
}

.structure-tree-row > i {
  width: 16px;
  flex: 0 0 16px;
  color: var(--kw-text-disabled);
  font-size: 0.875rem;
  text-align: center;
}

.structure-tree.root > .structure-tree-node > .structure-tree-row:not(.completed) > .structure-tree-node-icon {
  color: var(--kw-focus);
}

.structure-tree-row > .pi-file {
  color: var(--kw-focus);
}

.structure-tree-row > span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.structure-tree-row.active {
  color: var(--kw-text-light);
  background: var(--kw-surface-hover);
}

.structure-tree-row.active > .structure-tree-node-icon {
  color: var(--kw-focus);
}

.structure-tree-row.completed {
  color: var(--kw-text-light);
}

.structure-tree-row.completed > .structure-tree-node-icon,
.structure-tree-row > .structure-tree-status.pi-check {
  color: var(--kw-success);
}

.structure-tree-row.failed {
  color: var(--kw-text-light);
}

.structure-tree-row.failed > .structure-tree-node-icon,
.structure-tree-row > .structure-tree-status.pi-times {
  color: var(--kw-danger);
}

.structure-tree-row > .structure-tree-status {
  width: 16px;
  margin-left: auto;
  color: var(--kw-focus);
  font-size: 0.75rem;
}
</style>
