import { computed, type Ref } from 'vue'
import type { DocSweepSite, FooterStatus } from '../types'

type UseDocSweepReadinessOptions = {
  excelFile: Ref<string>
  documentsLength: Ref<number>
  sites: Ref<DocSweepSite[]>
  isSitesVerified: Ref<boolean>
  isRunning: Ref<boolean>
  isSweepInitialized: Ref<boolean>
  footerStatus: Ref<FooterStatus>
  sweepStatus: Ref<string>
}

export function useDocSweepReadiness(options: UseDocSweepReadinessOptions) {
  const enabledSites = computed(() => options.sites.value.filter(site => site.enabled))

  const canStartSweep = computed(() => {
    if (!options.excelFile.value.trim()) {
      return false
    }

    if (options.documentsLength.value === 0) {
      return false
    }

    if (enabledSites.value.length === 0) {
      return false
    }

    return options.isSitesVerified.value && enabledSites.value.every(site => site.status === 'Ready')
  })

  const footerStatusMessage = computed(() => {
    if (options.footerStatus.value === 'error') {
      return options.sweepStatus.value
    }

    if (options.isRunning.value) {
      return options.sweepStatus.value
    }

    if (options.isSweepInitialized.value) {
      return options.sweepStatus.value
    }

    if (canStartSweep.value) {
      return 'Ready to start sweep.'
    }

    if (!options.excelFile.value.trim()) {
      return 'Select an Excel file.'
    }

    if (options.documentsLength.value === 0) {
      return 'Load a valid Excel file.'
    }

    if (enabledSites.value.length === 0) {
      return 'Select at least one site.'
    }

    if (!options.isSitesVerified.value) {
      return 'Verify enabled sites before starting.'
    }

    if (!enabledSites.value.every(site => site.status === 'Ready')) {
      return 'One or more enabled sites are not ready.'
    }

    return options.sweepStatus.value
  })

  return {
    enabledSites,
    canStartSweep,
    footerStatusMessage,
  }
}
