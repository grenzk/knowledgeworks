<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from 'primevue/dialog'

type DocSweepSiteStatus = 'Not connected' | 'Verifying' | 'Ready' | 'Error'

type DocSweepSiteName = 'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'

type FooterStatus = 'ready' | 'warning' | 'error'

type SaveResultsChoice = 'save' | 'discard' | 'continue'

type DocSweepSite = {
  name: DocSweepSiteName
  status: DocSweepSiteStatus
  url: string
  matchUrl: string
  enabled: boolean
}

type SiteSummary = {
  site: string
  found: number
  notFound: number
  errors: number
  total: number
  elapsedMs: number
}

type ExcelDocument = {
  row: number
  controlNumber: string
  masw: string
  vertiv: string
  assetLibrary: string
  pdCloud: string
}

const excelFile = ref('')
const documents = ref<ExcelDocument[]>([])

const isVerifying = ref(false)
const isRunning = ref(false)
const isSitesVerified = ref(false)
const isSweepInitialized = ref(false)
const isCancelRequested = ref(false)
const showCancelDialog = ref(false)
const showSaveResultsDialog = ref(false)
const showSaveErrorDialog = ref(false)
const isSearchFinishing = ref(false)
const totalElapsedMs = ref(0)
const elapsedTick = ref(Date.now())

const sweepStatus = ref('Select an Excel file.')
const currentSite = ref('-')
const currentControlNumber = ref('-')
const completedCount = ref(0)
const totalCount = ref(0)
const sweepDocuments = ref<ExcelDocument[]>([])
const saveResultsChoice = ref<SaveResultsChoice | null>(null)
let saveResultsResolver: ((choice: SaveResultsChoice) => void) | null = null
let saveErrorResolver: ((saved: boolean) => void) | null = null
let totalStartTime = 0
let elapsedTimer: ReturnType<typeof setInterval> | null = null
const siteStartTimes = new Map<string, number>()
const footerStatus = ref<FooterStatus>('warning')

const sites = ref<DocSweepSite[]>([
  {
    name: 'Vertiv',
    status: 'Not connected',
    url: 'https://www.vertiv.com/en-us/',
    matchUrl: 'https://www.vertiv.com/en-us/',
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
    name: 'PD Cloud',
    status: 'Not connected',
    url: 'https://egup.fa.us2.oraclecloud.com/fscmUI/faces/FndOverview?pageParams=fndGlobalItemNodeId%3DitemNode_product_management_product_development&fndGlobalItemNodeId=itemNode_product_management_product_development&_adf.ctrl-state=CTzs-5yoqQZV_1&_adf.no-new-window-redirect=true&_afrLoop=2780622838863036&_afrWindowMode=2&_afrWindowId=null&_afrFS=16&_afrMT=screen&_afrMFW=944&_afrMFH=882&_afrMFDW=1920&_afrMFDH=1080&_afrMFC=8&_afrMFCI=0&_afrMFM=0&_afrMFR=96&_afrMFG=0&_afrMFS=0&_afrMFO=0',
    matchUrl:
      'https://egup.fa.us2.oraclecloud.com/fscmUI/faces/FndOverview?pageParams=fndGlobalItemNodeId%3DitemNode_product_management_product_development&fndGlobalItemNodeId=itemNode_product_management_product_development',
    enabled: true,
  },
  {
    name: 'MASW',
    status: 'Not connected',
    url: 'https://amerplmpwiap01.int.vertivco.com/File_Display_MBD/faces/UserManualDisplay.xhtml',
    matchUrl: 'https://amerplmpwiap01.int.vertivco.com/File_Display_MBD/faces/UserManualDisplay.xhtml',
    enabled: true,
  },
])

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

const canStartSweep = computed(() => {
  if (!excelFile.value.trim()) {
    return false
  }

  if (documents.value.length === 0) {
    return false
  }

  const enabledSites = sites.value.filter(site => site.enabled)

  if (enabledSites.length === 0) {
    return false
  }

  return isSitesVerified.value && enabledSites.every(site => site.status === 'Ready')
})

const footerStatusMessage = computed(() => {
  if (footerStatus.value === 'error') {
    return sweepStatus.value
  }

  if (isRunning.value) {
    return sweepStatus.value
  }

  if (isSweepInitialized.value) {
    return sweepStatus.value
  }

  if (canStartSweep.value) {
    return 'Ready to start sweep.'
  }

  if (!excelFile.value.trim()) {
    return 'Select an Excel file.'
  }

  if (documents.value.length === 0) {
    return 'Load a valid Excel file.'
  }

  const enabledSites = sites.value.filter(site => site.enabled)

  if (enabledSites.length === 0) {
    return 'Select at least one site.'
  }

  if (!isSitesVerified.value) {
    return 'Verify enabled sites before starting.'
  }

  if (!enabledSites.every(site => site.status === 'Ready')) {
    return 'One or more enabled sites are not ready.'
  }

  return sweepStatus.value
})

async function showLogs(): Promise<void> {
  await window.knowledgeworks.openLogs()
}

async function openSite(url: string, matchUrl: string): Promise<void> {
  await window.docsweep.openSite(url, matchUrl)
}

async function verifySites(): Promise<void> {
  if (isVerifying.value) {
    return
  }

  isSitesVerified.value = false

  const includedSites = sites.value.filter(site => site.enabled).map(site => site.name)

  if (includedSites.length === 0) {
    sweepStatus.value = 'Select at least one site to verify.'
    return
  }

  isVerifying.value = true
  sweepStatus.value = 'Checking sites...'

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
      footerStatus.value = 'error'
      sweepStatus.value = result.error ?? 'Site verification failed.'

      for (const site of sites.value) {
        if (site.enabled) {
          site.status = 'Error'
        }
      }

      return
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

    footerStatus.value = allEnabledSitesReady && canStartSweep.value ? 'ready' : 'warning'

    sweepStatus.value = allEnabledSitesReady
      ? 'All enabled sites are ready.'
      : 'One or more enabled sites are not ready.'
  } finally {
    isVerifying.value = false
  }
}

function invalidateSiteVerification(): void {
  isSitesVerified.value = false
  isSweepInitialized.value = false

  for (const site of sites.value) {
    if (!site.enabled) {
      site.status = 'Not connected'
    }
  }

  footerStatus.value = 'warning'
  sweepStatus.value = 'Site configuration changed. Verify sites again.'
}

async function selectExcelFile(): Promise<void> {
  if (isRunning.value) {
    return
  }

  const result = await window.docsweep.selectExcelFile()

  if (!result.ok || !result.filePath) {
    return
  }

  const loadResult = await window.docsweep.loadExcel(result.filePath)

  if (!loadResult.ok) {
    excelFile.value = ''
    documents.value = []
    isSitesVerified.value = false
    footerStatus.value = 'error'
    sweepStatus.value = loadResult.error ?? 'Unable to load the Excel file.'

    return
  }

  excelFile.value = result.filePath
  documents.value = loadResult.documents
  isSweepInitialized.value = false

  isSitesVerified.value = false
  footerStatus.value = 'warning'
  sweepStatus.value = `Loaded ${documents.value.length} control number(s). Verify enabled sites before starting.`
}

async function saveSweepResults(): Promise<boolean> {
  const documentsToSave = sweepDocuments.value.map(document => ({
    row: document.row,
    controlNumber: document.controlNumber,
    masw: document.masw,
    vertiv: document.vertiv,
    assetLibrary: document.assetLibrary,
    pdCloud: document.pdCloud,
  }))

  const enabledSites = sites.value.filter(site => site.enabled).map(site => site.name)

  const result = await window.docsweep.saveExcel(excelFile.value, documentsToSave, enabledSites)

  if (!result.ok) {
    console.error('DocSweep Excel save failed:', result.message)
    return false
  }

  return true
}

async function saveSweepResultsAs(): Promise<boolean> {
  const dialogResult = await window.docsweep.saveExcelAs()

  if (dialogResult.canceled || !dialogResult.ok || !dialogResult.filePath) {
    return false
  }

  const documentsToSave = sweepDocuments.value.map(document => ({
    row: document.row,
    controlNumber: document.controlNumber,
    masw: document.masw,
    vertiv: document.vertiv,
    assetLibrary: document.assetLibrary,
    pdCloud: document.pdCloud,
  }))

  const enabledSites = sites.value.filter(site => site.enabled).map(site => site.name)

  const saveResult = await window.docsweep.saveExcel(
    excelFile.value,
    documentsToSave,
    enabledSites,
    dialogResult.filePath,
  )

  if (!saveResult.ok) {
    throw new Error(saveResult.message || 'Unable to save Excel file.')
  }

  return true
}

async function saveResultsAsRecovery(): Promise<void> {
  try {
    const saved = await saveSweepResultsAs()

    if (!saved) {
      // User cancelled Save As or the dialog did not complete.
      // Keep the save-error dialog open so the results remain recoverable.
      showSaveErrorDialog.value = true
      return
    }

    showSaveErrorDialog.value = false

    saveErrorResolver?.(true)
    saveErrorResolver = null

    footerStatus.value = 'ready'
    sweepStatus.value = 'Sweep results saved successfully.'
  } catch (error) {
    console.error('DocSweep Save As failed:', error)

    showSaveErrorDialog.value = true

    sweepStatus.value = error instanceof Error ? error.message : 'Unable to save Excel file.'
  }
}

async function saveResultsWithRecovery(): Promise<boolean> {
  sweepStatus.value = 'Saving sweep results to Excel...'

  try {
    const saved = await saveSweepResults()

    if (saved) {
      return true
    }

    sweepStatus.value = 'Unable to save results to the current Excel file.'
  } catch (error) {
    console.error('DocSweep Excel save failed:', error)

    sweepStatus.value = error instanceof Error ? error.message : 'Unable to save results to Excel.'
  }

  return await handleSaveFailure()
}

async function handleSaveFailure(): Promise<boolean> {
  showSaveErrorDialog.value = true

  return new Promise(resolve => {
    saveErrorResolver = resolve
  })
}

async function retrySaveResults(): Promise<void> {
  showSaveErrorDialog.value = false

  const saved = await saveSweepResults()

  if (saved) {
    saveErrorResolver?.(true)
    saveErrorResolver = null
    return
  }

  showSaveErrorDialog.value = true
}

function requestCancelSweep(): void {
  if (!isRunning.value || showSaveResultsDialog.value || isSearchFinishing.value) {
    return
  }

  showCancelDialog.value = true
}

function confirmCancelSweep(): void {
  showCancelDialog.value = false

  isCancelRequested.value = true
  isSearchFinishing.value = true

  sweepStatus.value = 'Cancellation requested. Finishing the current search...'
}

function saveCancelledResults(): void {
  saveResultsChoice.value = 'save'
  showSaveResultsDialog.value = false

  saveResultsResolver?.('save')
  saveResultsResolver = null
}

function discardSweepResults(): void {
  saveResultsChoice.value = 'discard'
  showSaveResultsDialog.value = false

  saveResultsResolver?.('discard')
  saveResultsResolver = null
}

function continueSweep(): void {
  saveResultsChoice.value = 'continue'
  isCancelRequested.value = false
  isSearchFinishing.value = false
  showSaveResultsDialog.value = false

  saveResultsResolver?.('continue')
  saveResultsResolver = null
}

function waitForSaveResultsChoice(): Promise<SaveResultsChoice> {
  saveResultsChoice.value = null
  showSaveResultsDialog.value = true

  return new Promise(resolve => {
    saveResultsResolver = resolve
  })
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function startElapsedTimer(): void {
  totalStartTime = Date.now()
  totalElapsedMs.value = 0
  elapsedTick.value = Date.now()

  if (elapsedTimer) {
    clearInterval(elapsedTimer)
  }

  elapsedTimer = setInterval(() => {
    elapsedTick.value = Date.now()

    if (totalStartTime > 0) {
      totalElapsedMs.value = Date.now() - totalStartTime
    }

    if (currentSite.value !== '-') {
      const siteStartTime = siteStartTimes.get(currentSite.value)

      if (siteStartTime) {
        const elapsedMs = Date.now() - siteStartTime

        summary.value = summary.value.map(item =>
          item.site === currentSite.value
            ? {
                ...item,
                elapsedMs,
              }
            : item,
        )
      }
    }
  }, 1000)
}

function stopElapsedTimer(): void {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }

  elapsedTick.value = Date.now()

  if (totalStartTime > 0) {
    totalElapsedMs.value = Date.now() - totalStartTime
  }

  if (currentSite.value !== '-') {
    const siteStartTime = siteStartTimes.get(currentSite.value)

    if (siteStartTime) {
      const elapsedMs = Date.now() - siteStartTime

      summary.value = summary.value.map(item =>
        item.site === currentSite.value
          ? {
              ...item,
              elapsedMs,
            }
          : item,
      )
    }
  }
}

onUnmounted(() => {
  stopElapsedTimer()
})

async function startSweep(): Promise<void> {
  if (!canStartSweep.value || isRunning.value) {
    footerStatus.value = 'warning'
    return
  }

  isRunning.value = true
  startElapsedTimer()
  siteStartTimes.clear()
  footerStatus.value = 'warning'
  isSweepInitialized.value = false
  isCancelRequested.value = false
  saveResultsChoice.value = null

  completedCount.value = 0
  currentSite.value = '-'
  currentControlNumber.value = '-'

  sweepDocuments.value = documents.value.map(document => ({
    row: document.row,
    controlNumber: document.controlNumber,
    masw: document.masw,
    vertiv: document.vertiv,
    assetLibrary: document.assetLibrary,
    pdCloud: document.pdCloud,
  }))

  const enabledSites = sites.value.filter(site => site.enabled)

  totalCount.value = sweepDocuments.value.length * enabledSites.length

  try {
    if (sweepDocuments.value.length === 0) {
      throw new Error('No control numbers are available for the sweep.')
    }

    if (enabledSites.length === 0) {
      throw new Error('No enabled sites are available for the sweep.')
    }

    isSweepInitialized.value = true

    // Reset results for all enabled sites.
    summary.value = summary.value.map(item => {
      return {
        ...item,
        found: 0,
        notFound: 0,
        errors: 0,
        total: 0,
        elapsedMs: 0,
      }
    })

    for (let siteIndex = 0; siteIndex < enabledSites.length; siteIndex++) {
      const site = enabledSites[siteIndex]
      const siteStartTime = Date.now()
      siteStartTimes.set(site.name, siteStartTime)
      currentSite.value = site.name

      sweepStatus.value = `Starting ${site.name} sweep...`

      for (let documentIndex = 0; documentIndex < sweepDocuments.value.length; documentIndex++) {
        const document = sweepDocuments.value[documentIndex]

        if (isCancelRequested.value) {
          const choice = await waitForSaveResultsChoice()

          if (choice === 'continue') {
            isCancelRequested.value = false

            currentSite.value = site.name
            currentControlNumber.value = document.controlNumber

            sweepStatus.value = `Resuming ${site.name} search for ${document.controlNumber}...`

            // Continue with the current document.
          } else if (choice === 'save') {
            const saved = await saveResultsWithRecovery()

            if (!saved) {
              footerStatus.value = 'error'
              sweepStatus.value = 'Unable to save results. Your collected results are still available.'

              isRunning.value = false
              return
            }

            sweepStatus.value = 'Sweep cancelled. Results collected so far were saved to Excel.'

            footerStatus.value = 'ready'
            isRunning.value = false
            return
          } else {
            sweepStatus.value = 'Sweep cancelled. Results were not saved.'

            footerStatus.value = 'ready'
            isRunning.value = false
            return
          }
        }

        currentControlNumber.value = document.controlNumber

        sweepStatus.value = `Searching ${site.name} for ${document.controlNumber}...`

        try {
          const result = await window.docsweep.runSweep(site.name, document.controlNumber)

          const resultValue =
            !result.ok || result.status === 'Error' ? 'Error' : result.status === 'Found' ? 'Check' : 'NA'

          if (site.name === 'MASW') {
            document.masw = resultValue
          } else if (site.name === 'Vertiv') {
            document.vertiv = resultValue
          } else if (site.name === 'Asset Library') {
            document.assetLibrary = resultValue
          } else if (site.name === 'PD Cloud') {
            document.pdCloud = resultValue
          }

          summary.value = summary.value.map(item => {
            if (item.site !== site.name) {
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

          sweepStatus.value = `Completed ${site.name} search for ${document.controlNumber}.`
        } catch (error) {
          summary.value = summary.value.map(item => {
            if (item.site !== site.name) {
              return item
            }

            return {
              ...item,
              errors: item.errors + 1,
              total: item.total + 1,
            }
          })

          console.error(`DocSweep ${site.name} failed for ${document.controlNumber}:`, error)

          sweepStatus.value = `${site.name} search failed for ${document.controlNumber}.`
        } finally {
          completedCount.value += 1
        }
      }

      const siteElapsedMs = Date.now() - siteStartTime

      summary.value = summary.value.map(item =>
        item.site === site.name
          ? {
              ...item,
              elapsedMs: siteElapsedMs,
            }
          : item,
      )

      sweepStatus.value = `${site.name} sweep completed for ${sweepDocuments.value.length} control number(s).`
    }

    currentSite.value = '-'
    currentControlNumber.value = '-'

    const saved = await saveResultsWithRecovery()

    if (!saved) {
      footerStatus.value = 'error'
      sweepStatus.value = 'Unable to save results. Your collected results are still available.'
      return
    }

    sweepStatus.value =
      `Sweep completed for ${sweepDocuments.value.length} control number(s) ` +
      `across ${enabledSites.length} enabled site(s). Results saved to Excel.`

    footerStatus.value = 'ready'
  } catch (error) {
    footerStatus.value = 'error'

    sweepStatus.value = error instanceof Error ? error.message : 'Sweep failed.'
  } finally {
    stopElapsedTimer()
    isRunning.value = false
    isSearchFinishing.value = false
  }
}
</script>

<template>
  <main class="docsweep-shell">
    <div class="docsweep-titlebar" aria-hidden="true"></div>

    <!-- =====================================================
         HEADER
         ===================================================== -->
    <header class="docsweep-header">
      <div class="docsweep-brand" aria-label="DocSweep">
        <div class="docsweep-mark">
          <span>DS</span>
        </div>

        <span class="docsweep-title">DocSweep</span>
      </div>

      <Button
        v-tooltip.bottom="'Show logs'"
        icon="pi pi-code"
        class="docsweep-icon-button"
        text
        aria-label="Show logs"
        @click="showLogs"
      />
    </header>

    <!-- =====================================================
         DASHBOARD
         ===================================================== -->
    <section class="dashboard-grid">
      <!-- ===================================================
           1. CONFIGURATION
           =================================================== -->
      <article class="dashboard-card configuration-card">
        <header class="card-header">
          <div class="card-title">
            <i class="pi pi-cog" aria-hidden="true" />
            <span>CONFIGURATION</span>
          </div>
        </header>

        <div class="configuration-body">
          <!-- Excel File -->
          <div class="configuration-input">
            <div class="field-row">
              <label for="excel-file">Excel File</label>

              <div class="input-with-button">
                <InputText
                  id="excel-file"
                  v-model="excelFile"
                  placeholder="Select Excel input file"
                  :disabled="isRunning"
                />

                <Button
                  icon="pi pi-folder-open"
                  label="Browse"
                  severity="secondary"
                  outlined
                  :disabled="isRunning"
                  @click="selectExcelFile"
                />
              </div>
            </div>

            <div class="configuration-actions">
              <Button
                label="Verify Sites"
                icon="pi pi-shield"
                severity="secondary"
                outlined
                :loading="isVerifying"
                :disabled="isRunning"
                @click="verifySites"
              />
            </div>
          </div>

          <!-- Connected Sites -->
          <div class="connected-sites">
            <div class="section-label">Connected Sites</div>

            <div class="sites-table">
              <div class="sites-table-header">
                <span>Site</span>
                <span>Status</span>
                <span class="include-header">Include</span>
              </div>

              <div v-for="site in sites" :key="site.name" class="site-row">
                <div class="site-name">
                  <span class="site-icon">
                    <i class="pi pi-globe" aria-hidden="true" />
                  </span>

                  <strong>{{ site.name }}</strong>
                </div>

                <div class="site-status" :class="`status-${site.status.toLowerCase().replaceAll(' ', '-')}`">
                  <i class="pi pi-circle-fill" aria-hidden="true" />

                  <span>{{ site.status }}</span>
                </div>

                <div class="site-actions">
                  <ToggleSwitch
                    v-model="site.enabled"
                    @update:model-value="invalidateSiteVerification"
                    :disabled="isRunning"
                    :aria-label="`Enable ${site.name} for sweep`"
                  />

                  <Button
                    icon="pi pi-external-link"
                    severity="secondary"
                    text
                    rounded
                    aria-label="Open site"
                    @click="openSite(site.url, site.matchUrl)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- ===================================================
           2. SWEEP PROGRESS
           =================================================== -->
      <article class="dashboard-card progress-card">
        <header class="card-header">
          <div class="card-title">
            <i class="pi pi-chart-line" aria-hidden="true" />

            <span>SWEEP PROGRESS</span>
          </div>
        </header>

        <div class="progress-content">
          <!-- Progress visualization -->
          <div class="progress-visual">
            <div class="progress-circle" :style="{ '--progress': progress }">
              <span>{{ progress }}%</span>
            </div>

            <div class="progress-caption">{{ completedCount }} of {{ totalCount }} completed</div>

            <ProgressBar :value="progress" :show-value="false" />
          </div>

          <!-- Progress information -->
          <div class="progress-details">
            <div class="progress-detail">
              <span>Current Site</span>
              <strong>{{ currentSite }}</strong>
            </div>

            <div class="progress-detail">
              <span>Current Control Number</span>
              <strong>{{ currentControlNumber }}</strong>
            </div>

            <div class="progress-detail">
              <span>Progress</span>
              <strong> {{ completedCount }} / {{ totalCount }} ({{ progress }}%) </strong>
            </div>
          </div>
        </div>
      </article>

      <!-- ===================================================
           3. SUMMARY
           =================================================== -->
      <article class="dashboard-card summary-card">
        <header class="card-header">
          <div class="card-title">
            <i class="pi pi-chart-bar" aria-hidden="true" />

            <span>SUMMARY</span>
          </div>
        </header>

        <div class="summary-table-wrapper">
          <table class="summary-table">
            <colgroup>
              <col class="col-site" />
              <col class="col-count" />
              <col class="col-count" />
              <col class="col-count" />
              <col class="col-count" />
              <col class="col-success" />
              <col class="col-elapsed" />
            </colgroup>
            <thead>
              <tr>
                <th>Site</th>
                <th>Found</th>
                <th>Not Found</th>
                <th>Errors</th>
                <th>Total</th>
                <th>Success Rate</th>
                <th>Elapsed</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="item in summary" :key="item.site">
                <td>
                  <strong>{{ item.site }}</strong>
                </td>

                <td class="found-value">
                  {{ item.found }}
                </td>

                <td class="not-found-value">
                  {{ item.notFound }}
                </td>

                <td class="error-value">
                  {{ item.errors }}
                </td>

                <td>
                  {{ item.total }}
                </td>

                <td>
                  <div class="success-rate">
                    <span> {{ item.total ? Math.round((item.found / item.total) * 1000) / 10 : 0 }}% </span>

                    <ProgressBar :value="item.total ? (item.found / item.total) * 100 : 0" :show-value="false" />
                  </div>
                </td>

                <td class="elapsed-value">
                  {{ formatElapsed(item.elapsedMs) }}
                </td>
              </tr>

              <!-- TOTAL -->
              <tr class="summary-total">
                <td>TOTAL</td>

                <td class="found-value">
                  {{ totalFound }}
                </td>

                <td class="not-found-value">
                  {{ totalNotFound }}
                </td>

                <td class="error-value">
                  {{ totalErrors }}
                </td>

                <td>
                  {{ totalResults }}
                </td>

                <td>
                  <div class="success-rate">
                    <span>{{ successRate }}%</span>

                    <ProgressBar :value="successRate" :show-value="false" />
                  </div>
                </td>

                <td class="elapsed-value">
                  {{ formatElapsed(totalElapsedMs) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <!-- =====================================================
         FOOTER
         ===================================================== -->
    <footer class="docsweep-footer">
      <div class="footer-status">
        <span class="footer-status-dot" :class="`footer-status-${footerStatus}`" />

        <span>{{ footerStatusMessage }}</span>
      </div>

      <Button
        :label="isRunning ? 'Cancel Sweep' : 'Start Sweep'"
        :icon="isRunning ? 'pi pi-times' : 'pi pi-play'"
        :loading="false"
        :disabled="isSearchFinishing || (!isRunning && !canStartSweep)"
        class="start-sweep-button"
        @click="isRunning ? requestCancelSweep() : startSweep()"
      />
    </footer>

    <!-- =====================================================
      DIALOG
      ===================================================== -->
    <Dialog v-model:visible="showCancelDialog" modal class="kw-dialog" :style="{ width: '28rem' }">
      <template #header>
        <div class="dialog-header-content">
          <i class="pi pi-exclamation-triangle dialog-header-icon" />
          <span>Cancel Sweep</span>
        </div>
      </template>

      <div>
        <p class="mt-0 mb-0">Are you sure you want to cancel the current sweep?</p>
      </div>

      <template #footer>
        <Button label="Continue Sweep" severity="secondary" @click="showCancelDialog = false" />

        <Button label="Cancel Sweep" severity="danger" icon="pi pi-times" @click="confirmCancelSweep" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showSaveResultsDialog"
      modal
      class="kw-dialog"
      :style="{ width: '32rem' }"
      :closable="false"
    >
      <template #header>
        <div class="dialog-header-content">
          <i class="pi pi-save dialog-header-icon" />
          <span>Save Sweep Results?</span>
        </div>
      </template>

      <div>
        <p class="mt-0 mb-2">The sweep has been cancelled.</p>

        <p class="mt-0 mb-0">Would you like to save the results collected so far?</p>
      </div>

      <template #footer>
        <Button label="Continue Sweep" severity="secondary" @click="continueSweep" />

        <Button label="Don't Save" severity="danger" @click="discardSweepResults" />

        <Button label="Save Results" icon="pi pi-save" @click="saveCancelledResults" />
      </template>
    </Dialog>

    <Dialog v-model:visible="showSaveErrorDialog" modal class="kw-dialog" :style="{ width: '34rem' }" :closable="false">
      <template #header>
        <div class="dialog-header-content">
          <i class="pi pi-exclamation-triangle dialog-header-icon" />
          <span>Unable to Save Results</span>
        </div>
      </template>

      <div>
        <p class="mt-0 mb-2">The sweep results could not be saved to the current Excel file.</p>

        <p class="mt-0 mb-0">Your collected results are still available. What would you like to do?</p>
      </div>

      <template #footer>
        <Button label="Save As" icon="pi pi-file-export" severity="secondary" @click="saveResultsAsRecovery" />

        <Button label="Retry Save" icon="pi pi-refresh" @click="retrySaveResults" />
      </template>
    </Dialog>
  </main>
</template>

<style scoped>
/* =========================================================
   DOCSWEEP SHELL
   ========================================================= */

.docsweep-shell {
  display: grid;
  grid-template-rows:
    36px
    60px
    minmax(0, 1fr)
    64px;
  width: 100%;
  height: 100%;
  min-width: 1000px;
  min-height: 0;
  overflow: hidden;
  color: var(--kw-text-light);
  background: var(--kw-quiet-surface);
}

.docsweep-titlebar {
  -webkit-app-region: drag;
  border-bottom: 1px solid var(--kw-border-subtle);
  background: var(--kw-canvas);
}

/* =========================================================
   HEADER
   ========================================================= */

.docsweep-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--kw-border-subtle);
  background: var(--kw-quiet-header);
}
.docsweep-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}
.docsweep-mark {
  position: relative;
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  color: var(--kw-text-light);
  border: 2px solid var(--kw-primary);
  border-radius: 8px;
  background: var(--kw-surface);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}
.docsweep-mark::after {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 4px;
  height: 4px;
  content: '';
  background: var(--kw-accent);
}
.docsweep-title {
  overflow: hidden;
  color: var(--kw-text-light);
  font-size: 1rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* =========================================================
   LOG BUTTON
   ========================================================= */

:deep(.docsweep-icon-button.p-button) {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
  border-radius: 8px;
  background: transparent;
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out;
}
:deep(.docsweep-icon-button.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-text-muted);
  background: var(--kw-surface-hover);
}
:deep(.docsweep-icon-button.p-button:focus-visible) {
  outline: 2px solid var(--kw-focus);
  outline-offset: 1px;
}
:deep(.docsweep-icon-button .p-button-icon) {
  font-size: 0.95rem;
}

/* =========================================================
   WORKSPACE
   ========================================================= */

.dashboard-grid {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(0, 1fr);
  grid-template-rows:
    auto
    auto;
  align-items: stretch;
  align-content: start;
  gap: 10px;
  padding: 12px 16px 14px;
  scrollbar-color: var(--kw-border) var(--kw-quiet-surface);
}

/* =========================================================
   DASHBOARD CARDS
   ========================================================= */

.dashboard-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--kw-border);
  border-radius: 10px;
  background: var(--kw-surface);
  height: 100%;
}
.card-header {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 8px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--kw-border-subtle);
  background: var(--kw-quiet-header);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--kw-text-light);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.card-title i {
  color: var(--kw-vertiv-color);
  font-size: 0.75rem;
}

/* =========================================================
   CONFIGURATION
   ========================================================= */

.configuration-card {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  height: 100%;
}

.configuration-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 14px;
  box-sizing: border-box;
}

/* =========================================================
   EXCEL INPUT
   ========================================================= */

.configuration-input {
  width: 100%;
  min-width: 0;
}
.field-row {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.field-row label {
  color: var(--kw-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
}
.input-with-button {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns:
    minmax(0, 1fr)
    auto;
  gap: 6px;
  align-items: center;
}
.input-with-button :deep(.p-inputtext) {
  width: 100%;
  min-width: 0;
  height: 34px;
  box-sizing: border-box;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
  border-radius: 7px;
  background: var(--kw-quiet-surface);
  font-size: 0.75rem;
}
.input-with-button :deep(.p-inputtext::placeholder) {
  color: var(--kw-text-disabled);
}
.input-with-button :deep(.p-inputtext:enabled:hover) {
  border-color: var(--kw-text-muted);
}
.input-with-button :deep(.p-inputtext:enabled:focus) {
  border-color: var(--kw-focus);
  box-shadow: 0 0 0 1px var(--kw-focus);
}
.input-with-button :deep(.p-button) {
  height: 34px;
  padding: 0 10px;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
  border-radius: 7px;
  background: transparent;
  font-size: 0.75rem;
}
.input-with-button :deep(.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-text-muted);
  background: var(--kw-surface-hover);
}

/* =========================================================
   CONFIGURATION ACTIONS
   ========================================================= */

.configuration-actions {
  display: flex;
  margin-top: 10px;
}
.configuration-actions :deep(.p-button) {
  height: 32px;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--kw-text-light);
  border: 1px solid var(--kw-border);
}
.configuration-actions :deep(.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-text-muted);
  background: var(--kw-surface-hover);
}

/* =========================================================
   CONNECTED SITES
   ========================================================= */

.connected-sites {
  min-width: 0;
}
.section-label {
  margin-bottom: 7px;
  color: var(--kw-text-light);
  font-size: 0.75rem;
  font-weight: 600;
}
.sites-table {
  width: 100%;
  overflow: hidden;
  border-radius: 4px;
}
.sites-table-header,
.site-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.2fr) minmax(140px, 1fr) 96px;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  box-sizing: border-box;
}
.sites-table-header {
  min-height: 28px;
  padding: 0 8px;
  background: var(--kw-surface-hover);
  color: var(--kw-text-muted);
  font-size: 0.68rem;
  font-weight: 600;
  min-height: 30px;
  color: var(--kw-text-muted);
  background: var(--kw-quiet-surface);
  font-size: 0.7rem;
  font-weight: 700;
}
.site-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(120px, 1fr) 76px;
  align-items: center;
  min-height: 38px;
  padding: 0 8px;
  border-bottom: none;
}
.site-row:hover {
  background: var(--kw-surface-hover);
}
.site-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.site-name strong {
  overflow: hidden;
  color: var(--kw-text-light);
  font-size: 0.75rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.site-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  color: var(--kw-text-muted);
  border: 1px solid var(--kw-border);
  border-radius: 6px;
  font-size: 0.7rem;
}
.site-icon i {
  font-size: 0.65rem;
}
.site-status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--kw-text-muted);
  font-size: 0.7rem;
}
.site-status i {
  font-size: 0.4rem;
}
.status-not-connected {
  color: var(--kw-text-muted);
}
.status-verifying {
  color: var(--kw-accent);
}
.status-ready {
  color: var(--kw-success);
}
.status-error {
  color: var(--kw-danger);
}
.site-row :deep(.p-button) {
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--kw-text-muted);
  border-radius: 6px;
}
.site-row :deep(.p-button:enabled:hover) {
  color: var(--kw-text-light);
  background: var(--kw-surface-hover);
}
.include-header {
  text-align: center;
}
.site-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}
/* Toggle switch */
.site-actions :deep(.p-toggleswitch) {
  width: 32px;
  height: 18px;
  flex: 0 0 32px;
}
/* Toggle track */
.site-actions :deep(.p-toggleswitch-slider) {
  width: 36px;
  height: 18px;
}
/* Toggle handle */
.site-actions :deep(.p-toggleswitch-handle) {
  width: 16px;
  height: 16px;
}
.site-actions :deep(.p-toggleswitch:not(.p-toggleswitch-checked) .p-toggleswitch-handle) {
  inset-inline-start: 2px;
}
/* Open-site button */
.site-actions :deep(.p-button) {
  width: 26px;
  height: 26px;
  min-width: 26px;
  padding: 0;
  flex: 0 0 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* Open-site icon */
.site-actions :deep(.p-button .p-button-icon) {
  margin: 0;
  font-size: 0.75rem;
}

/* =========================================================
   SWEEP PROGRESS
   ========================================================= */

.progress-card {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  height: 100%;
}
.progress-content {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr);
  height: calc(100% - 38px);
  min-height: 250px;
  gap: 16px;
  padding: 20px 24px;
  align-items: stretch;
  box-sizing: border-box;
}
.progress-details {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  min-width: 0;
}
.progress-detail {
  display: grid;
  grid-template-columns:
    150px
    minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  font-size: 0.75rem;
}
.progress-detail span {
  color: var(--kw-text-muted);
}
.progress-detail strong {
  min-width: 0;
  overflow: hidden;
  color: var(--kw-text-light);
  font-size: 0.75rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  padding: 16px 0px;
  border-bottom: 1px solid var(--kw-border-subtle);
}
.progress-circle {
  position: relative;
  display: grid;
  width: 116px;
  height: 116px;
  place-items: center;
  box-sizing: border-box;
  color: var(--kw-text-light);
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--kw-vertiv-color) calc(var(--progress) * 1%), var(--kw-border) 0);
}
.progress-circle::before {
  position: absolute;
  width: 100px;
  height: 100px;
  content: '';
  border-radius: 50%;
  background: var(--kw-surface);
}
.progress-circle span {
  position: relative;
  z-index: 1;
  font-size: 1.1rem;
  font-weight: 700;
}
.progress-caption {
  color: var(--kw-text-muted);
  font-size: 0.65rem;
  text-align: center;
}
.progress-visual :deep(.p-progressbar) {
  width: 120px;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--kw-border);
}
.progress-visual :deep(.p-progressbar-value) {
  background: var(--kw-vertiv-color);
}

/* =========================================================
   SUMMARY
   ========================================================= */

.summary-card {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
}
.summary-table-wrapper {
  width: 100%;
  overflow-x: auto;
}
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  table-layout: fixed;
}
.summary-table .col-site {
  width: 30%;
}
.summary-table .col-count {
  width: 20%;
}
.summary-table .col-success {
  width: 25%;
}
.summary-table .col-elapsed {
  width: 25%;
}
.summary-table th,
.summary-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--kw-border-subtle);
}
.summary-table th {
  color: var(--kw-text-muted);
  background: var(--kw-quiet-surface);
  font-size: 0.7rem;
  font-weight: 700;
}
.summary-table td {
  color: var(--kw-text-light);
}
.summary-table tbody tr:hover {
  background: var(--kw-surface-hover);
}
.summary-table th:last-child,
.summary-table td:last-child {
  white-space: nowrap;
}
.found-value {
  color: var(--kw-success) !important;
  font-weight: 700;
}
.not-found-value {
  color: var(--kw-vertiv-color) !important;
  font-weight: 700;
}
.error-value {
  color: var(--kw-danger) !important;
  font-weight: 700;
}
.success-rate {
  display: grid;
  grid-template-columns:
    42px
    minmax(60px, 1fr);
  align-items: center;
  gap: 8px;
}
.success-rate :deep(.p-progressbar) {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--kw-border);
}
.success-rate :deep(.p-progressbar-value) {
  background: var(--kw-success);
}
.summary-total td {
  color: var(--kw-text-light);
  border-bottom: 0;
  font-weight: 700;
}
.elapsed-value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* =========================================================
   FOOTER
   ========================================================= */

.docsweep-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 8px 16px;
  border-top: 1px solid var(--kw-border-subtle);
  background: var(--kw-quiet-header);
}
.footer-status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--kw-text-muted);
  font-size: 0.7rem;
}
.footer-status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--kw-text-disabled);
}
.footer-status-dot.footer-status-ready {
  background: var(--kw-success);
}
.footer-status-dot.footer-status-warning {
  background: var(--kw-vertiv-color);
}
.footer-status-dot.footer-status-error {
  background: var(--kw-danger);
}
.footer-status-dot.running {
  background: var(--kw-primary);
}
:deep(.start-sweep-button.p-button) {
  min-width: 120px;
  height: 36px;
  color: var(--kw-text-light);
  border-color: var(--kw-vertiv-color);
  border-radius: 7px;
  background: var(--kw-vertiv-color);
  font-size: 0.7rem;
  font-weight: 600;
}
:deep(.start-sweep-button.p-button:enabled:hover) {
  color: var(--kw-text-light) !important;
  border-color: var(--kw-vertiv-hover);
  background: var(--kw-vertiv-hover);
}
:deep(.start-sweep-button.p-button:enabled:active) {
  border-color: var(--kw-vertiv-pressed);
  background: var(--kw-vertiv-pressed);
}
:deep(.start-sweep-button.p-button:disabled) {
  color: var(--kw-text-disabled);
  border-color: var(--kw-border);
  background: var(--kw-surface);
  opacity: 1;
}

/* =========================================================
   DIALOGS
   ========================================================= */

:global(.kw-dialog) {
  overflow: hidden;
  color: var(--kw-text-light) !important;
  border: 1px solid var(--kw-border) !important;
  border-radius: 10px;
  background: var(--kw-surface) !important;
  box-shadow: none;
}

:global(.kw-dialog .p-dialog-header) {
  min-height: 42px;
  padding: 8px 12px;
  color: var(--kw-text-light);
  border-bottom: 1px solid var(--kw-border-subtle) !important;
  background: var(--kw-quiet-header) !important;
}

:global(.kw-dialog .p-dialog-content) {
  padding: 14px 12px;
  color: var(--kw-text-light);
  background: var(--kw-surface);
  font-size: 0.72rem;
}

:global(.kw-dialog .p-dialog-footer) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 9px 12px;
  border-top: 1px solid var(--kw-border-subtle);
  background: var(--kw-quiet-header);
}

:global(.kw-dialog .p-dialog-header-actions) {
  gap: 4px;
}

:global(.kw-dialog .p-dialog-header-icon) {
  width: 28px;
  height: 28px;
  color: var(--kw-text-muted);
  border-radius: 6px;
}

:global(.kw-dialog .p-dialog-header-icon:hover) {
  color: var(--kw-text-light);
  background: var(--kw-surface-hover);
}

.dialog-header-content {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--kw-text-light);
  font-size: 0.72rem;
  font-weight: 700;
}

.dialog-header-icon {
  color: var(--kw-vertiv-color);
  font-size: 0.8rem;
}

:global(.kw-dialog .p-button) {
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 0.68rem;
  font-weight: 600;
}

:global(.kw-dialog .p-button:focus-visible) {
  outline: 2px solid var(--kw-focus);
  outline-offset: 1px;
}

:global(.p-dialog-mask) {
  background: rgb(0 0 0 / 45%);
}

/* =========================================================
   GENERAL PRIMEVUE OVERRIDES
   ========================================================= */

:deep(.p-button) {
  font-family: inherit;
  box-shadow: none;
}
:deep(.p-button:focus-visible) {
  outline: 2px solid var(--kw-focus);
  outline-offset: 1px;
}
:deep(.p-progressbar) {
  background: var(--kw-border);
}
:deep(.p-progressbar-value) {
  background: var(--kw-vertiv-color);
}

/* =========================================================
   SCROLLBAR
   ========================================================= */

.dashboard-grid::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dashboard-grid::-webkit-scrollbar-track {
  background: var(--kw-quiet-surface);
}
.dashboard-grid::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--kw-border);
}
.dashboard-grid::-webkit-scrollbar-thumb:hover {
  background: var(--kw-text-muted);
}

/* =========================================================
   RESPONSIVE
   ========================================================= */

@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  .configuration-card,
  .progress-card,
  .summary-card {
    grid-column: 1;
  }
  .configuration-card {
    grid-row: 1;
  }
  .progress-card {
    grid-row: 2;
  }
  .summary-card {
    grid-row: 3;
  }
}

@media (max-width: 700px) {
  .docsweep-shell {
    min-width: 0;
  }
  .docsweep-header {
    padding: 10px 12px;
  }
  .dashboard-grid {
    padding: 10px 12px 12px;
  }
  .input-with-button {
    grid-template-columns:
      minmax(0, 1fr)
      auto;
  }
  .progress-content {
    grid-template-columns: 1fr;
  }
  .progress-visual {
    padding-top: 10px;
    padding-left: 0;
    border-top: 1px solid var(--kw-border-subtle);
    border-left: 0;
  }
  .progress-detail {
    grid-template-columns:
      120px
      minmax(0, 1fr);
  }
  .sites-table-header,
  .site-row {
    grid-template-columns:
      minmax(100px, 1.2fr)
      minmax(80px, 1fr)
      28px;
  }
}

@media (max-width: 500px) {
  .input-with-button {
    grid-template-columns: 1fr;
  }
  .configuration-actions {
    width: 100%;
  }
  .configuration-actions :deep(.p-button) {
    width: 100%;
  }
  .docsweep-footer {
    padding-inline: 12px;
  }
  :deep(.start-sweep-button.p-button) {
    min-width: 110px;
  }
  .summary-table {
    min-width: 600px;
  }
}

/* =========================================================
   REDUCED MOTION
   ========================================================= */

@media (prefers-reduced-motion: reduce) {
  .docsweep-shell *,
  .docsweep-shell *::before,
  .docsweep-shell *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
