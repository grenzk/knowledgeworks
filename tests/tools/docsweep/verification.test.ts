import type { Locator, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { verifySites } from '../../../src/tools/docsweep/automation/verification.ts'

const PD_CLOUD_URL =
  'https://egup.fa.us2.oraclecloud.com/fscmUI/faces/FndOverview?pageParams=fndGlobalItemNodeId%3DitemNode_product_management_product_development&fndGlobalItemNodeId=itemNode_product_management_product_development'

describe('verifySites', () => {
  it('recovers when the PD Cloud expiry dialog appears after verification starts', async () => {
    let expiredDialogVisible = false
    const okButton = createLocator()
    const expiredDialog = createLocator({
      isVisible: () => expiredDialogVisible,
      locator: () => okButton,
    })
    const readyOrExpired = createLocator({
      waitFor: async () => {
        expiredDialogVisible = true
      },
    })
    const advancedSearchButton = createLocator({
      or: () => readyOrExpired,
    })
    const page = {
      locator: vi.fn((selector: string) => (selector === '.AFPopupSelector' ? expiredDialog : advancedSearchButton)),
      url: () => PD_CLOUD_URL,
    } as unknown as Page

    const results = await verifySites([page], ['PD Cloud'])

    expect(results).toEqual([{ name: 'PD Cloud', status: 'Ready' }])
    expect(okButton.click).toHaveBeenCalledOnce()
    expect(expiredDialog.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 30_000 })
    expect(advancedSearchButton.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 30_000 })
  })
})

function createLocator(overrides: Record<string, unknown> = {}): Locator {
  const locator = {
    click: vi.fn(),
    filter: vi.fn(),
    first: vi.fn(),
    isVisible: vi.fn(() => false),
    locator: vi.fn(),
    or: vi.fn(),
    waitFor: vi.fn(),
    ...overrides,
  }

  locator.filter.mockReturnValue(locator)
  locator.first.mockReturnValue(locator)

  return locator as unknown as Locator
}
