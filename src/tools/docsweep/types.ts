export type DocSweepSiteStatus = 'Not connected' | 'Verifying' | 'Ready' | 'Error'

export type DocSweepSiteName = 'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'

export type FooterStatus = 'ready' | 'warning' | 'error'

export type SaveResultsChoice = 'save' | 'discard' | 'continue'

export type DocSweepSite = {
  name: DocSweepSiteName
  status: DocSweepSiteStatus
  url: string
  matchUrl: string
  enabled: boolean
}

export type SiteSummary = {
  site: string
  found: number
  notFound: number
  errors: number
  total: number
  elapsedMs: number
}

export type ExcelDocument = {
  row: number
  controlNumber: string
  masw: string
  vertiv: string
  assetLibrary: string
  pdCloud: string
}
