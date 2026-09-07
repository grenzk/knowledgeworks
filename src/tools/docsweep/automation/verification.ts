import type { Page } from 'playwright'

export type DocSweepSiteName = 'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'

export type DocSweepSiteVerification = {
  name: DocSweepSiteName
  status: 'Ready' | 'Not connected' | 'Error'
  reason?: string
}

type SiteDefinition = {
  name: DocSweepSiteName
  matchUrl: string
}

const PD_CLOUD_READY_TIMEOUT_MS = 30_000

const SITE_DEFINITIONS: SiteDefinition[] = [
  {
    name: 'Vertiv',
    matchUrl: 'https://www.vertiv.com/en-us/',
  },
  {
    name: 'Asset Library',
    matchUrl: 'https://asset-library.vertiv.com/',
  },
  {
    name: 'PD Cloud',
    matchUrl:
      'https://egup.fa.us2.oraclecloud.com/fscmUI/faces/FndOverview?pageParams=fndGlobalItemNodeId%3DitemNode_product_management_product_development&fndGlobalItemNodeId=itemNode_product_management_product_development',
  },
  {
    name: 'MASW',
    matchUrl: 'https://amerplmpwiap01.int.vertivco.com/File_Display_MBD/faces/UserManualDisplay.xhtml',
  },
]

export async function verifySites(
  pages: Page[],
  includedSites: DocSweepSiteName[],
): Promise<DocSweepSiteVerification[]> {
  const results: DocSweepSiteVerification[] = []

  for (const site of SITE_DEFINITIONS) {
    if (!includedSites.includes(site.name)) {
      continue
    }

    const page = findSitePage(pages, site.matchUrl)

    if (!page) {
      results.push({
        name: site.name,
        status: 'Not connected',
        reason: `${site.name} tab is not open.`,
      })

      continue
    }

    try {
      results.push(await verifySite(site.name, page))
    } catch (error) {
      results.push({
        name: site.name,
        status: 'Error',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

function findSitePage(pages: Page[], matchUrl: string): Page | undefined {
  return pages.find(page => page.url().startsWith(matchUrl))
}

async function verifySite(siteName: DocSweepSiteName, page: Page): Promise<DocSweepSiteVerification> {
  switch (siteName) {
    case 'Vertiv':
      return verifyVertiv(page)

    case 'Asset Library':
      return verifyAssetLibrary(page)

    case 'PD Cloud':
      return verifyPDCloud(page)

    case 'MASW':
      return verifyMASW(page)
  }
}

async function verifyVertiv(page: Page): Promise<DocSweepSiteVerification> {
  const searchButton = page.locator('button.search-expand__icon')

  if (!(await searchButton.first().isVisible())) {
    return {
      name: 'Vertiv',
      status: 'Not connected',
      reason: 'Vertiv search button is not visible.',
    }
  }

  return {
    name: 'Vertiv',
    status: 'Ready',
  }
}

async function verifyAssetLibrary(page: Page): Promise<DocSweepSiteVerification> {
  const searchInput = page.locator('#searchInput')

  if (!(await searchInput.first().isVisible())) {
    return {
      name: 'Asset Library',
      status: 'Not connected',
      reason: 'Asset Library search box is not visible.',
    }
  }

  return {
    name: 'Asset Library',
    status: 'Ready',
  }
}

async function verifyPDCloud(page: Page): Promise<DocSweepSiteVerification> {
  try {
    const expiredDialog = page
      .locator('.AFPopupSelector')
      .filter({ hasText: 'The page has expired. Click OK to continue.' })
      .first()
    const advancedSearchButton = page.locator("a[aria-label*='Advanced Search']").first()
    const readyOrExpired = advancedSearchButton.or(expiredDialog).first()

    await readyOrExpired.waitFor({
      state: 'visible',
      timeout: PD_CLOUD_READY_TIMEOUT_MS,
    })

    if (await expiredDialog.isVisible()) {
      const okButton = expiredDialog.locator('button[_afrpdo="ok"]').first()

      await okButton.waitFor({ state: 'visible', timeout: PD_CLOUD_READY_TIMEOUT_MS })
      await okButton.click()

      await expiredDialog.waitFor({
        state: 'hidden',
        timeout: PD_CLOUD_READY_TIMEOUT_MS,
      })
    }

    await advancedSearchButton.waitFor({
      state: 'visible',
      timeout: PD_CLOUD_READY_TIMEOUT_MS,
    })

    return {
      name: 'PD Cloud',
      status: 'Ready',
    }
  } catch (error) {
    return {
      name: 'PD Cloud',
      status: 'Not connected',
      reason: error instanceof Error ? error.message : 'PD Cloud Advanced Search is not available.',
    }
  }
}

async function verifyMASW(page: Page): Promise<DocSweepSiteVerification> {
  const searchInput = page.locator('#mcpForm\\:attValue')

  if (!(await searchInput.first().isVisible())) {
    return {
      name: 'MASW',
      status: 'Not connected',
      reason: 'MASW search box is not visible.',
    }
  }

  return {
    name: 'MASW',
    status: 'Ready',
  }
}
