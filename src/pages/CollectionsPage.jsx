import { useEffect, useMemo, useState } from 'react'
import { Check, Eye, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import Header from '../components/Header'
import PanelAccessError from '../components/PanelAccessError'
import StatusBadge from '../components/StatusBadge'
import { apiGet, apiPost, capturePanelAccess } from '../lib/api'

export default function CollectionsPage() {
  const [authorized, setAuthorized] = useState(null)
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [correction, setCorrection] = useState(null)
  const [processingId, setProcessingId] = useState('')

  useEffect(() => {
    capturePanelAccess('collections')
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [summaryData, recordData] = await Promise.all([
        apiGet('/api/collections/summary', 'collections'),
        apiGet('/api/collections/records', 'collections')
      ])
      setSummary(summaryData)
      setRecords(recordData.records || [])
      setAuthorized(true)
    } catch (requestError) {
      if (requestError.status === 401) setAuthorized(false)
      else setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return records.filter((record) => {
      const statusMatch = filter === 'all' || record.status === filter
      const searchMatch = !needle || [record.student.identification, record.student.fullName, record.student.careerName, record.bank, record.referenceNumber].some((value) => String(value || '').toLowerCase().includes(needle))
      return statusMatch && searchMatch
    })
  }, [records, filter, search])

  async function approve(recordId) {
    if (!window.confirm('¿Aprobar este comprobante?')) return
    setProcessingId(recordId)
    setError('')
    try {
      await apiPost(`/api/collections/records/${recordId}/approve`, {}, 'collections')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProcessingId('')
    }
  }

  async function requestCorrection(event) {
    event.preventDefault()
    if (!correction?.reason.trim()) return
    setProcessingId(correction.id)
    setError('')
    try {
      await apiPost(`/api/collections/records/${correction.id}/correction`, { reason: correction.reason.trim() }, 'collections')
      setCorrection(null)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProcessingId('')
    }
  }

  async function openReceipt(recordId) {
    const popup = window.open('about:blank', '_blank')
    if (!popup) {
      setError('El navegador bloqueó la nueva ventana. Habilite las ventanas emergentes e inténtelo nuevamente.')
      return
    }
    popup.opener = null
    setError('')
    try {
      const result = await apiPost(`/api/collections/records/${recordId}/signed-url`, {}, 'collections')
      popup.location.replace(result.url)
    } catch (requestError) {
      popup.close()
      setError(requestError.message)
    }
  }

  if (authorized === false) return <PanelAccessError panelName="Panel de recaudaciones" />

  return (
    <>
      <Header title="Panel de recaudaciones" subtitle="Revisión de comprobantes de incorporación" />
      <main className="page-shell">
        <div className="panel-heading">
          <div><span className="eyebrow">Bandeja de revisión</span><h2>Comprobantes recibidos</h2></div>
          <button className="button secondary" onClick={loadData} disabled={loading}><RefreshCw size={18} /> Actualizar</button>
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <section className="metrics-grid">
          <article className="metric-card"><span>Pendientes</span><strong>{summary?.pending ?? '—'}</strong></article>
          <article className="metric-card"><span>Correcciones</span><strong>{summary?.correctionRequested ?? '—'}</strong></article>
          <article className="metric-card"><span>Aprobados</span><strong>{summary?.approved ?? '—'}</strong></article>
          <article className="metric-card"><span>Total recibidos</span><strong>{summary?.total ?? '—'}</strong></article>
        </section>
        <section className="card">
          <div className="toolbar">
            <div className="search-field"><Search size={18} /><input placeholder="Buscar por cédula, nombre, carrera o referencia" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending">Pendientes</option><option value="correction_requested">Corrección solicitada</option><option value="approved">Aprobados</option><option value="all">Todos</option></select>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Estudiante</th><th>Carrera</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const canReview = record.status === 'pending'
                  const processing = processingId === record.id
                  return (
                    <tr key={record.id}>
                      <td><strong>{record.student.fullName}</strong><small>{record.student.identification}</small></td>
                      <td>{record.student.careerName || '—'}</td>
                      <td><strong>{record.bank}</strong><small>{record.paymentDate} · {record.referenceNumber || 'Sin referencia'}</small></td>
                      <td><StatusBadge status={record.status} /></td>
                      <td>
                        <div className="action-row">
                          <button className="icon-button" title="Ver comprobante" onClick={() => openReceipt(record.id)} disabled={processing}><Eye size={18} /></button>
                          {canReview ? <button className="icon-button success" title="Aprobar" onClick={() => approve(record.id)} disabled={processing}><Check size={18} /></button> : null}
                          {canReview ? <button className="icon-button warning" title="Solicitar corrección" onClick={() => setCorrection({ id: record.id, reason: '' })} disabled={processing}><TriangleAlert size={18} /></button> : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && filteredRecords.length === 0 ? <tr><td colSpan="5" className="empty-cell">No hay comprobantes con estos filtros.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {correction ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !processingId && setCorrection(null)}>
          <form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="correction-title" onSubmit={requestCorrection} onMouseDown={(event) => event.stopPropagation()}>
            <h3 id="correction-title">Solicitar corrección</h3>
            <p>Escribe claramente lo que el estudiante debe corregir.</p>
            <textarea autoFocus value={correction.reason} onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))} rows="5" maxLength="500" required disabled={Boolean(processingId)} />
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setCorrection(null)} disabled={Boolean(processingId)}>Cancelar</button>
              <button className="button primary" disabled={Boolean(processingId)}>{processingId ? 'Enviando...' : 'Enviar corrección'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
