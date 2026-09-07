import type { Page } from 'playwright'

export type MASWSweepResult = {
  site: 'MASW'
  status: 'Found' | 'Not Found' | 'Error'
  message: string
}

const EXPECTED_HOST = 'amerplmpwiap01.int.vertivco.com'
const SEARCH_INPUT_SELECTOR = '#mcpForm\\:attValue'
const SEARCH_BUTTON_SELECTOR = '#mcpForm\\:advancedSearchButton'
const SEARCH_STATUS_SELECTOR = '#mcpForm\\:itemDetailTable .ui-datatable-header label:first-of-type'
const NO_RESULTS_SELECTOR = 'xpath=//td[contains(., "No Item found with the given Criteria")]'

export async function sweepMASW(pages: Page[], controlNumber: string): Promise<MASWSweepResult> {
  const page = pages.find(page => page.url().toLowerCase().includes(EXPECTED_HOST))

  if (!page) {
    return {
      site: 'MASW',
      status: 'Error',
      message: 'MASW tab is not open.',
    }
  }

  try {
    await executeSearch(page, controlNumber)

    if (await hasNoResults(page)) {
      return {
        site: 'MASW',
        status: 'Not Found',
        message: 'NA',
      }
    }

    return {
      site: 'MASW',
      status: 'Found',
      message: 'Check',
    }
  } catch (error) {
    return {
      site: 'MASW',
      status: 'Error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function executeSearch(page: Page, controlNumber: string): Promise<void> {
  const search = page.locator(SEARCH_INPUT_SELECTOR).first()

  await search.waitFor({
    state: 'visible',
    timeout: 15_000,
  })

  await search.fill(controlNumber)

  const button = page.locator(SEARCH_BUTTON_SELECTOR).first()

  await button.waitFor({
    state: 'visible',
    timeout: 15_000,
  })

  await button.click({ noWaitAfter: true })

  await waitForSearchComplete(page, controlNumber)
}

async function waitForSearchComplete(page: Page, controlNumber: string): Promise<void> {
  await page.waitForFunction(
    ({ selector, expected }) => {
      const element = document.querySelector(selector)

      if (!element) {
        return false
      }

      const text = element.textContent?.toUpperCase() ?? ''

      return text.includes(expected.toUpperCase())
    },
    {
      selector: SEARCH_STATUS_SELECTOR,
      expected: controlNumber,
    },
    {
      timeout: 60_000,
    },
  )
}

async function hasNoResults(page: Page): Promise<boolean> {
  const elements = page.locator(NO_RESULTS_SELECTOR)

  if ((await elements.count()) === 0) {
    return false
  }

  return elements.first().isVisible()
}
