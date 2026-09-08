import { onUnmounted, ref } from 'vue'

type SiteSummaryUpdater = (siteName: string, elapsedMs: number) => void

export function useDocSweepTimer(updateSiteElapsed: SiteSummaryUpdater) {
  const totalElapsedMs = ref(0)
  const elapsedTick = ref(Date.now())

  let totalStartTime = 0
  let elapsedTimer: ReturnType<typeof setInterval> | null = null

  const siteStartTimes = new Map<string, number>()

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

      for (const [siteName, siteStartTime] of siteStartTimes) {
        updateSiteElapsed(siteName, Date.now() - siteStartTime)
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

    for (const [siteName, siteStartTime] of siteStartTimes) {
      updateSiteElapsed(siteName, Date.now() - siteStartTime)
    }
  }

  function startSiteTimer(siteName: string): void {
    siteStartTimes.set(siteName, Date.now())
  }

  function stopSiteTimer(siteName: string): number {
    const siteStartTime = siteStartTimes.get(siteName)

    if (!siteStartTime) {
      return 0
    }

    const elapsedMs = Date.now() - siteStartTime

    updateSiteElapsed(siteName, elapsedMs)

    return elapsedMs
  }

  function clearSiteTimers(): void {
    siteStartTimes.clear()
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

  onUnmounted(() => {
    stopElapsedTimer()
  })

  return {
    totalElapsedMs,
    elapsedTick,
    startElapsedTimer,
    stopElapsedTimer,
    startSiteTimer,
    stopSiteTimer,
    clearSiteTimers,
    formatElapsed,
  }
}
