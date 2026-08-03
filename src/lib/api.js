function panelStorageKey(panel) {
  return `itsqmet_${panel}_access`
}

export function capturePanelAccess(panel) {
  const params = new URLSearchParams(window.location.search)
  const access = params.get('access')
  if (access) {
    sessionStorage.setItem(panelStorageKey(panel), access)
    params.delete('access')
    const nextQuery = params.toString()
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`
    window.history.replaceState({}, '', nextUrl)
  }
  return sessionStorage.getItem(panelStorageKey(panel)) || ''
}

export function getPanelAccess(panel) {
  return sessionStorage.getItem(panelStorageKey(panel)) || ''
}

async function request(path, options = {}) {
  const response = await fetch(path, options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error
      ? payload.error
      : 'No se pudo completar la solicitud.'
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export function apiGet(path, panel) {
  const headers = panel ? { 'x-panel-access': getPanelAccess(panel) } : {}
  return request(path, { headers })
}

export function apiPost(path, body, panel) {
  const headers = {}
  let finalBody = body
  if (panel) headers['x-panel-access'] = getPanelAccess(panel)
  if (!(body instanceof FormData)) {
    headers['content-type'] = 'application/json'
    finalBody = JSON.stringify(body ?? {})
  }
  return request(path, { method: 'POST', headers, body: finalBody })
}
