import type { Ref } from 'vue'
import type { SaveResultsChoice } from '../types'

type UseDocSweepCancellationOptions = {
  isRunning: Ref<boolean>
  isCancelRequested: Ref<boolean>
  isSearchFinishing: Ref<boolean>
  showCancelDialog: Ref<boolean>
  showSaveResultsDialog: Ref<boolean>
  saveResultsChoice: Ref<SaveResultsChoice | null>
  sweepStatus: Ref<string>
}

export function useDocSweepCancellation(options: UseDocSweepCancellationOptions) {
  let saveResultsResolver: ((choice: SaveResultsChoice) => void) | null = null

  function requestCancelSweep(): void {
    if (!options.isRunning.value || options.showSaveResultsDialog.value || options.isSearchFinishing.value) {
      return
    }

    options.showCancelDialog.value = true
  }

  function confirmCancelSweep(): void {
    options.showCancelDialog.value = false
    options.isCancelRequested.value = true
    options.isSearchFinishing.value = true
    options.sweepStatus.value = 'Cancellation requested. Finishing the current search...'
  }

  function saveCancelledResults(): void {
    options.saveResultsChoice.value = 'save'
    options.showSaveResultsDialog.value = false
    saveResultsResolver?.('save')
    saveResultsResolver = null
  }

  function discardSweepResults(): void {
    options.saveResultsChoice.value = 'discard'
    options.showSaveResultsDialog.value = false
    saveResultsResolver?.('discard')
    saveResultsResolver = null
  }

  function continueSweep(): void {
    options.saveResultsChoice.value = 'continue'
    options.isCancelRequested.value = false
    options.isSearchFinishing.value = false
    options.showSaveResultsDialog.value = false
    saveResultsResolver?.('continue')
    saveResultsResolver = null
  }

  function waitForSaveResultsChoice(): Promise<SaveResultsChoice> {
    options.saveResultsChoice.value = null
    options.showSaveResultsDialog.value = true

    return new Promise(resolve => {
      saveResultsResolver = resolve
    })
  }

  return {
    requestCancelSweep,
    confirmCancelSweep,
    saveCancelledResults,
    discardSweepResults,
    continueSweep,
    waitForSaveResultsChoice,
  }
}
