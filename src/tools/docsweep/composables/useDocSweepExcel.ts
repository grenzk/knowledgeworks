import type { Ref } from 'vue'
import type { ExcelDocument } from '../types'

type UseDocSweepExcelOptions = {
  excelFile: Ref<string>
  documents: Ref<ExcelDocument[]>
  isSweepInitialized: Ref<boolean>
  isSitesVerified: Ref<boolean>
  footerStatus: Ref<'ready' | 'warning' | 'error'>
  sweepStatus: Ref<string>
  isRunning: Ref<boolean>
}

export function useDocSweepExcel(options: UseDocSweepExcelOptions) {
  async function selectExcelFile(): Promise<void> {
    if (options.isRunning.value) {
      return
    }

    const result = await window.docsweep.selectExcelFile()

    if (!result.ok || !result.filePath) {
      return
    }

    const loadResult = await window.docsweep.loadExcel(result.filePath)

    if (!loadResult.ok) {
      options.excelFile.value = ''
      options.documents.value = []
      options.isSitesVerified.value = false
      options.footerStatus.value = 'error'
      options.sweepStatus.value = loadResult.error ?? 'Unable to load the Excel file.'

      return
    }

    options.excelFile.value = result.filePath
    options.documents.value = loadResult.documents
    options.isSweepInitialized.value = false
    options.isSitesVerified.value = false
    options.footerStatus.value = 'warning'
    options.sweepStatus.value = `Loaded ${options.documents.value.length} control number(s). Verify enabled sites before starting.`
  }

  return {
    selectExcelFile,
  }
}
