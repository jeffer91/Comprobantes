function panelAccessValue(panel) {
  if (panel === 'admin') return 'administracion'
  if (panel === 'collections') return 'recaudaciones'
  return ''
}

export function capturePanelAccess(panel) {
  return panelAccessValue(panel)
}

export function getPanelAccess(panel) {
  return panelAccessValue(panel)
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
