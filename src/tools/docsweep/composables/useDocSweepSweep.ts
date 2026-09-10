import type { Ref } from 'vue'
import type { DocSweepSiteName, ExcelDocument, SiteSummary } from '../types'

type SweepSite = {
  name: DocSweepSiteName
}

type SweepResult = {
  ok: boolean
  status?: 'Found' | 'Not Found' | 'Error'
}

type SaveResultsChoice = 'save' | 'discard' | 'continue'

type UseDocSweepSweepOptions = {
  sweepDocuments: Ref<ExcelDocument[]>
  enabledSites: Ref<SweepSite[]>
  summary: Ref<SiteSummary[]>
  completedCount: Ref<number>
  totalCount: Ref<number>
  currentSite: Ref<string>
  currentControlNumber: Ref<string>
  sweepStatus: Ref<string>
  isCancelRequested: Ref<boolean>
  isSweepInitialized: Ref<boolean>

  startSiteTimer: (siteName: string) => void
  stopSiteTimer: (siteName: string) => number

  waitForSaveResultsChoice: () => Promise<SaveResultsChoice>
  saveResultsWithRecovery: () => Promise<boolean>

  onCancelSaveFailure: () => void
  onCancelSaved: () => void
  onCancelDiscarded: () => void
}

export function useDocSweepSweep(options: UseDocSweepSweepOptions) {
  function setDocumentResult(document: ExcelDocument, siteName: string, resultValue: string): void {
    if (siteName === 'MASW') {
      document.masw = resultValue
    } else if (siteName === 'Vertiv') {
      document.vertiv = resultValue
    } else if (siteName === 'Asset Library') {
      document.assetLibrary = resultValue
    } else if (siteName === 'PD Cloud') {
      document.pdCloud = resultValue
    }
  }

  function updateSummary(siteName: string, result: SweepResult): void {
    options.summary.value = options.summary.value.map(item => {
      if (item.site !== siteName) {
        return item
      }

      if (!result.ok || result.status === 'Error') {
        return {
          ...item,
          errors: item.errors + 1,
          total: item.total + 1,
        }
      }

      if (result.status === 'Found') {
        return {
          ...item,
          found: item.found + 1,
          total: item.total + 1,
        }
      }

      return {
        ...item,
        notFound: item.notFound + 1,
        total: item.total + 1,
      }
    })
  }

  async function runSweep(): Promise<void> {
    options.isSweepInitialized.value = true

    options.summary.value = options.summary.value.map(item => ({
      ...item,
      found: 0,
      notFound: 0,
      errors: 0,
      total: 0,
      elapsedMs: 0,
    }))

    for (let siteIndex = 0; siteIndex < options.enabledSites.value.length; siteIndex++) {
      const site = options.enabledSites.value[siteIndex]

      options.startSiteTimer(site.name)
      options.currentSite.value = site.name
      options.sweepStatus.value = `Starting ${site.name} sweep...`

      for (let documentIndex = 0; documentIndex < options.sweepDocuments.value.length; documentIndex++) {
        const document = options.sweepDocuments.value[documentIndex]

        if (options.isCancelRequested.value) {
          const choice = await options.waitForSaveResultsChoice()

          if (choice === 'continue') {
            options.isCancelRequested.value = false

            options.currentSite.value = site.name
            options.currentControlNumber.value = document.controlNumber
            options.sweepStatus.value = `Resuming ${site.name} search for ${document.controlNumber}...`
          } else if (choice === 'save') {
            const saved = await options.saveResultsWithRecovery()

            if (!saved) {
              options.onCancelSaveFailure()
              return
            }

            options.onCancelSaved()
            return
          } else {
            options.onCancelDiscarded()
            return
          }
        }

        options.currentControlNumber.value = document.controlNumber
        options.sweepStatus.value = `Searching ${site.name} for ${document.controlNumber}...`

        try {
          const result = await window.docsweep.runSweep(site.name, document.controlNumber)

          const resultValue =
            !result.ok || result.status === 'Error' ? 'Error' : result.status === 'Found' ? 'Check' : 'NA'

          setDocumentResult(document, site.name, resultValue)

          updateSummary(site.name, result)
          options.sweepStatus.value = `Completed ${site.name} search for ${document.controlNumber}.`
        } catch (error) {
          console.error(`DocSweep ${site.name} search failed for ${document.controlNumber}:`, error)

          setDocumentResult(document, site.name, 'Error')

          updateSummary(site.name, {
            ok: false,
            status: 'Error',
          })
          options.sweepStatus.value = `${site.name} search failed for ${document.controlNumber}.`
        } finally {
          options.completedCount.value += 1
        }
      }

      options.stopSiteTimer(site.name)
      options.sweepStatus.value = `${site.name} sweep complete.`
    }

    options.currentSite.value = '-'
    options.currentControlNumber.value = '-'
  }

  return {
    runSweep,
  }
}
