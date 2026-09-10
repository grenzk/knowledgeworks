import { computed, ref, type Ref } from 'vue'
import type { ExcelDocument, SiteSummary } from '../types'

export function useDocSweepResults(documents: Ref<ExcelDocument[]>, enabledSiteCount: Ref<number>) {
  const currentSite = ref('-')
  const currentControlNumber = ref('-')
  const completedCount = ref(0)
  const totalCount = ref(0)
  const sweepDocuments = ref<ExcelDocument[]>([])

  const summary = ref<SiteSummary[]>([
    {
      site: 'Vertiv',
      found: 0,
      notFound: 0,
      errors: 0,
      total: 0,
      elapsedMs: 0,
    },
    {
      site: 'Asset Library',
      found: 0,
      notFound: 0,
      errors: 0,
      total: 0,
      elapsedMs: 0,
    },
    {
      site: 'PD Cloud',
      found: 0,
      notFound: 0,
      errors: 0,
      total: 0,
      elapsedMs: 0,
    },
    {
      site: 'MASW',
      found: 0,
      notFound: 0,
      errors: 0,
      total: 0,
      elapsedMs: 0,
    },
  ])

  const progress = computed(() => {
    if (totalCount.value === 0) {
      return 0
    }

    return Math.round((completedCount.value / totalCount.value) * 100)
  })

  const totalFound = computed(() => summary.value.reduce((total, item) => total + item.found, 0))

  const totalNotFound = computed(() => summary.value.reduce((total, item) => total + item.notFound, 0))

  const totalErrors = computed(() => summary.value.reduce((total, item) => total + item.errors, 0))

  const totalResults = computed(() => summary.value.reduce((total, item) => total + item.total, 0))

  const successRate = computed(() => {
    if (totalResults.value === 0) {
      return 0
    }

    return Math.round((totalFound.value / totalResults.value) * 1000) / 10
  })

  function initializeSweep(): void {
    sweepDocuments.value = documents.value.map(document => ({
      row: document.row,
      controlNumber: document.controlNumber,
      masw: document.masw,
      vertiv: document.vertiv,
      assetLibrary: document.assetLibrary,
      pdCloud: document.pdCloud,
    }))

    completedCount.value = 0
    currentSite.value = '-'
    currentControlNumber.value = '-'
    totalCount.value = sweepDocuments.value.length * enabledSiteCount.value
  }

  return {
    currentSite,
    currentControlNumber,
    completedCount,
    totalCount,
    sweepDocuments,
    summary,
    progress,
    totalFound,
    totalNotFound,
    totalErrors,
    totalResults,
    successRate,
    initializeSweep,
  }
}
