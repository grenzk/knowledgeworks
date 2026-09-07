import type { Page } from 'playwright'

export type AssetLibrarySweepResult = {
  site: 'Asset Library'
  status: 'Found' | 'Not Found' | 'Error'
  message: string
}

const EXPECTED_HOST = 'asset-library.vertiv.com'

const SEARCH_INPUT_SELECTOR = '#searchInput'
const CLEAR_BUTTON_SELECTOR = 'a'
const KEYWORD_SELECTOR = 'li span[title]'
const NO_RESULTS_SELECTOR = 'xpath=//span[text()="No Assets Found"]'

export async function sweepAssetLibrary(pages: Page[], controlNumber: string): Promise<AssetLibrarySweepResult> {
  const page = pages.find(page => page.url().toLowerCase().includes(EXPECTED_HOST))

  if (!page) {
    return {
      site: 'Asset Library',
      status: 'Error',
      message: 'Asset Library tab is not open.',
    }
  }

  try {
    await executeSearch(page, controlNumber)

    if (await hasNoResults(page)) {
      return {
        site: 'Asset Library',
        status: 'Not Found',
        message: 'NA',
      }
    }

    return {
      site: 'Asset Library',
      status: 'Found',
      message: 'Check',
    }
  } catch (error) {
    return {
      site: 'Asset Library',
      status: 'Error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function executeSearch(page: Page, controlNumber: string): Promise<void> {
  /*
   * Python:
   *
   * self.clear_search()
   */
  await clearSearch(page)

  /*
   * Python:
   *
   * search = WaitHelper.clickable(self.driver, self.SEARCH_INPUT)
   */
  const search = page.locator(SEARCH_INPUT_SELECTOR).first()

  await search.waitFor({
    state: 'visible',
    timeout: 15_000,
  })

  /*
   * Python:
   *
   * search.clear()
   * search.send_keys(control_number)
   * search.send_keys(Keys.ENTER)
   */
  await search.fill(controlNumber)
  await search.press('Enter')

  /*
   * Python:
   *
   * self.wait_for_search_complete(control_number)
   */
  await waitForSearchComplete(page, controlNumber)
}

async function clearSearch(page: Page): Promise<void> {
  /*
   * Python:
   *
   * buttons = self.driver.find_elements(*self.CLEAR_BUTTON)
   *
   * if not buttons:
   *     return
   */
  const clearButton = page
    .locator(CLEAR_BUTTON_SELECTOR)
    .filter({ hasText: /^Clear$/ })
    .first()

  if (!(await clearButton.count())) {
    return
  }

  /*
   * Python:
   *
   * buttons[0].click()
   */
  try {
    await clearButton.click()
  } catch (error) {
    throw new Error(
      `Clear button was found but could not be clicked: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  await waitForClearComplete(page)
}

async function waitForClearComplete(page: Page): Promise<void> {
  /*
   * Python:
   *
   * Wait until all keyword chips are gone.
   */
  try {
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, KEYWORD_SELECTOR, {
      timeout: 15_000,
    })
  } catch (error) {
    throw new Error(
      `Clear completed, but existing keyword chips did not disappear within 15s: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  /*
   * Python:
   *
   * self.wait_until_loading_complete()
   */
  await waitUntilLoadingComplete(page, 'after clearing the search')

  /*
   * Python:
   *
   * WaitHelper.clickable(self.driver, self.SEARCH_INPUT)
   */
  const search = page.locator(SEARCH_INPUT_SELECTOR).first()

  await search.waitFor({
    state: 'visible',
    timeout: 15_000,
  })
}

async function waitForSearchComplete(page: Page, controlNumber: string): Promise<void> {
  try {
    await page.waitForFunction(
      ({ selector, expected }) => {
        const elements = document.querySelectorAll(selector)

        if (elements.length === 0) {
          return false
        }

        const title = elements[0]?.getAttribute('title')?.trim()

        return title?.toUpperCase() === expected.toUpperCase()
      },
      {
        selector: KEYWORD_SELECTOR,
        expected: controlNumber,
      },
      {
        timeout: 15_000,
      },
    )
  } catch (error) {
    throw new Error(
      `Search result for "${controlNumber}" did not appear within 15s: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  await waitUntilLoadingComplete(page, `after searching for "${controlNumber}"`)
}

async function waitUntilLoadingComplete(page: Page, context: string): Promise<void> {
  /*
   * Python:
   *
   * "Loading..." not in driver.page_source
   */
  try {
    await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), undefined, {
      timeout: 15_000,
    })
  } catch (error) {
    throw new Error(
      `Asset Library was still loading ${context} after 15s: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function hasNoResults(page: Page): Promise<boolean> {
  const elements = page.locator(NO_RESULTS_SELECTOR)

  if ((await elements.count()) === 0) {
    return false
  }

  return elements.first().isVisible()
}
