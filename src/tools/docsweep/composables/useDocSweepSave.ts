import type { Ref } from 'vue'
import type { DocSweepSiteName, ExcelDocument } from '../types'

type SaveResult = {
  ok: boolean
  message?: string
}

type SaveExcelAsResult = {
  canceled: boolean
  ok: boolean
  filePath?: string
}

type UseDocSweepSaveOptions = {
  excelFile: Ref<string>
  sweepDocuments: Ref<ExcelDocument[]>
  enabledSites: Ref<DocSweepSiteName[]>

  sweepStatus: Ref<string>
  showSaveErrorDialog: Ref<boolean>

  saveErrorResolver: Ref<((saved: boolean) => void) | null>
}

export function useDocSweepSave(options: UseDocSweepSaveOptions) {
  function getDocumentsToSave(): ExcelDocument[] {
    return options.sweepDocuments.value.map(document => ({
      row: document.row,
      controlNumber: document.controlNumber,
      masw: document.masw,
      vertiv: document.vertiv,
      assetLibrary: document.assetLibrary,
      pdCloud: document.pdCloud,
    }))
  }

  async function saveSweepResults(): Promise<boolean> {
    const documentsToSave = getDocumentsToSave()

    const result = await window.docsweep.saveExcel(options.excelFile.value, documentsToSave, options.enabledSites.value)

    if (!result.ok) {
      console.error('DocSweep Excel save failed:', result.message)
      return false
    }

    return true
  }

  async function saveSweepResultsAs(): Promise<boolean> {
    const dialogResult = await window.docsweep.saveExcelAs()

    if (dialogResult.canceled || !dialogResult.ok || !dialogResult.filePath) {
      return false
    }

    const documentsToSave = getDocumentsToSave()

    const saveResult = await window.docsweep.saveExcel(
      options.excelFile.value,
      documentsToSave,
      options.enabledSites.value,
      dialogResult.filePath,
    )

    if (!saveResult.ok) {
      throw new Error(saveResult.message || 'Unable to save Excel file.')
    }

    return true
  }

  async function saveResultsAsRecovery(): Promise<void> {
    try {
      const saved = await saveSweepResultsAs()

      if (!saved) {
        options.showSaveErrorDialog.value = true
        return
      }

      options.showSaveErrorDialog.value = false

      options.saveErrorResolver.value?.(true)
      options.saveErrorResolver.value = null

      options.sweepStatus.value = 'Sweep results saved successfully.'
    } catch (error) {
      console.error('DocSweep Save As failed:', error)

      options.showSaveErrorDialog.value = true

      options.sweepStatus.value = error instanceof Error ? error.message : 'Unable to save Excel file.'
    }
  }

  async function saveResultsWithRecovery(): Promise<boolean> {
    options.sweepStatus.value = 'Saving sweep results to Excel...'

    try {
      const saved = await saveSweepResults()

      if (saved) {
        return true
      }

      options.sweepStatus.value = 'Unable to save results to the current Excel file.'
    } catch (error) {
      console.error('DocSweep Excel save failed:', error)

      options.sweepStatus.value = error instanceof Error ? error.message : 'Unable to save results to Excel.'
    }

    return await handleSaveFailure()
  }

  async function handleSaveFailure(): Promise<boolean> {
    options.showSaveErrorDialog.value = true

    return new Promise(resolve => {
      options.saveErrorResolver.value = resolve
    })
  }

  async function retrySaveResults(): Promise<void> {
    options.showSaveErrorDialog.value = false

    const saved = await saveSweepResults()

    if (saved) {
      options.saveErrorResolver.value?.(true)
      options.saveErrorResolver.value = null
      return
    }

    options.showSaveErrorDialog.value = true
  }

  return {
    saveSweepResults,
    saveSweepResultsAs,
    saveResultsAsRecovery,
    saveResultsWithRecovery,
    handleSaveFailure,
    retrySaveResults,
  }
}
