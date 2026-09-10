import { ref } from 'vue'
import type { DocSweepSite } from '../types'

export function useDocSweepSites() {
  const sites = ref<DocSweepSite[]>([
    {
      name: 'PD Cloud',
      status: 'Not connected',
      url: 'https://egup.fa.us2.oraclecloud.com/fscmUI/faces/FndOverview?pageParams=fndGlobalItemNodeId%3DitemNode_product_management_product_development&fndGlobalItemNodeId=itemNode_product_management_product_development&_adf.ctrl-state=CTzs-5yoqQZV_1&_adf.no-new-window-redirect=true&_afrLoop=2780622838863036&_afrWindowMode=2&_afrWindowId=null&_afrFS=16&_afrMT=screen&_afrMFW=944&_afrMFH=882&_afrMFDW=1920&_afrMFDH=1080&_afrMFC=8&_afrMFCI=0&_afrMFM=0&_afrMFR=96&_afrMFG=0&_afrMFS=0&_afrMFO=0',
      matchUrl:
        'https://egup.fa.us2.oraclecloud.com/fscmUI/faces/FndOverview?pageParams=fndGlobalItemNodeId%3DitemNode_product_management_product_development&fndGlobalItemNodeId=itemNode_product_management_product_development',
      enabled: true,
    },
    {
      name: 'Asset Library',
      status: 'Not connected',
      url: 'https://asset-library.vertiv.com/#/home?tabName=HOME',
      matchUrl: 'https://asset-library.vertiv.com/',
      enabled: true,
    },
    {
      name: 'MASW',
      status: 'Not connected',
      url: 'https://amerplmpwiap01.int.vertivco.com/File_Display_MBD/faces/UserManualDisplay.xhtml',
      matchUrl: 'https://amerplmpwiap01.int.vertivco.com/File_Display_MBD/faces/UserManualDisplay.xhtml',
      enabled: true,
    },
    {
      name: 'Vertiv',
      status: 'Not connected',
      url: 'https://www.vertiv.com/en-us/',
      matchUrl: 'https://www.vertiv.com/en-us/',
      enabled: true,
    },
  ])

  const isVerifying = ref(false)
  const isSitesVerified = ref(false)

  async function verifySites(): Promise<{
    ok: boolean
    error?: string
  }> {
    if (isVerifying.value) {
      return { ok: false }
    }

    isSitesVerified.value = false

    const includedSites = sites.value.filter(site => site.enabled).map(site => site.name)

    if (includedSites.length === 0) {
      return {
        ok: false,
        error: 'Select at least one site to verify.',
      }
    }

    isVerifying.value = true

    for (const site of sites.value) {
      if (site.enabled) {
        site.status = 'Verifying'
      } else {
        site.status = 'Not connected'
      }
    }

    try {
      const result = await window.docsweep.verifySites(includedSites)

      if (!result.ok) {
        for (const site of sites.value) {
          if (site.enabled) {
            site.status = 'Error'
          }
        }

        return {
          ok: false,
          error: result.error ?? 'Site verification failed.',
        }
      }

      for (const verification of result.results) {
        const site = sites.value.find(item => item.name === verification.name)

        if (!site) {
          continue
        }

        site.status = verification.status
      }

      const allEnabledSitesReady =
        result.results.length === includedSites.length && result.results.every(site => site.status === 'Ready')

      isSitesVerified.value = allEnabledSitesReady

      return {
        ok: allEnabledSitesReady,
      }
    } finally {
      isVerifying.value = false
    }
  }

  function invalidateSiteVerification(): void {
    isSitesVerified.value = false

    for (const site of sites.value) {
      if (!site.enabled) {
        site.status = 'Not connected'
      }
    }
  }

  return {
    sites,
    isVerifying,
    isSitesVerified,
    verifySites,
    invalidateSiteVerification,
  }
}
