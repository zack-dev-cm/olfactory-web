const readBridgeBaseUrl = (): string => {
  const candidate = import.meta.env.VITE_SEOGEO_BRIDGE_URL
  return typeof candidate === 'string' && candidate.trim() ? candidate.replace(/\/$/, '') : ''
}

const readStartParam = (): string | undefined => {
  const webApp = window.Telegram?.WebApp
  const unsafeStartParam = webApp?.initDataUnsafe?.start_param
  if (typeof unsafeStartParam === 'string' && unsafeStartParam.trim()) {
    return unsafeStartParam
  }

  const search = new URLSearchParams(window.location.search)
  return search.get('startapp') ?? search.get('tgWebAppStartParam') ?? undefined
}

export const startBridgeAnalytics = () => {
  const bridgeBaseUrl = readBridgeBaseUrl()
  if (!bridgeBaseUrl) {
    return undefined
  }

  const sessionId = crypto.randomUUID()
  const track = (eventType: string) => {
    const body = JSON.stringify({
      appId: 'olfactory',
      eventType,
      sessionId,
      startParam: readStartParam(),
      source: 'webapp',
    })

    void fetch(`${bridgeBaseUrl}/api/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  }

  track('session_start')
  const heartbeat = window.setInterval(() => track('heartbeat'), 30000)

  return {
    stop() {
      window.clearInterval(heartbeat)
      track('session_end')
    },
  }
}
