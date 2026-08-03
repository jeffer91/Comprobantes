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
    try {
      await apiPost(`/api/collections/records/${recordId}/approve`, {}, 'collections')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function requestCorrection(event) {
    event.preventDefault()
    if (!correction?.reason.trim()) return
    try {
      await apiPost(`/api/collections/records/${correction.id}/correction`, { reason: correction.reason.trim() }, 'collections')
      setCorrection(null)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function openReceipt(recordId) {
    try {
      const result = await apiPost(`/api/collections/records/${recordId}/signed-url`, {}, 'collections')
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (requestError) {
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
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td><strong>{record.student.fullName}</strong><small>{record.student.identification}</small></td>
                    <td>{record.student.careerName || '—'}</td>
                    <td><strong>{record.bank}</strong><small>{record.paymentDate} · {record.referenceNumber || 'Sin referencia'}</small></td>
                    <td><StatusBadge status={record.status} /></td>
                    <td><div className="action-row"><button className="icon-button" title="Ver comprobante" onClick={() => openReceipt(record.id)}><Eye size={18} /></button>{record.status !== 'approved' ? <button className="icon-button success" title="Aprobar" onClick={() => approve(record.id)}><Check size={18} /></button> : null}{record.status !== 'approved' ? <button className="icon-button warning" title="Solicitar corrección" onClick={() => setCorrection({ id: record.id, reason: '' })}><TriangleAlert size={18} /></button> : null}</div></td>
                  </tr>
                ))}
                {!loading && filteredRecords.length === 0 ? <tr><td colSpan="5" className="empty-cell">No hay comprobantes con estos filtros.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {correction ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setCorrection(null)}><form className="modal-card" onSubmit={requestCorrection} onMouseDown={(event) => event.stopPropagation()}><h3>Solicitar corrección</h3><p>Escribe claramente lo que el estudiante debe corregir.</p><textarea autoFocus value={correction.reason} onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))} rows="5" maxLength="500" required /><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setCorrection(null)}>Cancelar</button><button className="button primary">Enviar corrección</button></div></form></div> : null}
    </>
  )
}
