import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import Header from '../components/Header'
import PanelAccessError from '../components/PanelAccessError'
import StatusBadge from '../components/StatusBadge'
import { apiGet, apiPost, capturePanelAccess } from '../lib/api'

const EXPECTED_HEADERS = ['numeroIdentificacion', 'Nombres', 'CodigoCarrera', 'NombreCarrera', 'HorarioComplexivo', 'CorreoPersonal', 'CorreoInstitucional', 'Celular', 'Sede']

function normalizeSheetRows(rows) {
  return rows.map((row) => ({
    numeroIdentificacion: row.numeroIdentificacion ?? row.Cedula ?? row.cedula ?? '',
    Nombres: row.Nombres ?? row.nombres ?? row.Nombre ?? '',
    CodigoCarrera: row.CodigoCarrera ?? '',
    NombreCarrera: row.NombreCarrera ?? row.Carrera ?? row.carrera ?? '',
    HorarioComplexivo: row.HorarioComplexivo ?? '',
    CorreoPersonal: row.CorreoPersonal ?? '',
    CorreoInstitucional: row.CorreoInstitucional ?? '',
    Celular: row.Celular ?? row.celular ?? '',
    Sede: row.Sede ?? row.sede ?? ''
  }))
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(null)
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [rows, setRows] = useState([])
  const [filename, setFilename] = useState('')
  const [importing, setImporting] = useState(false)
  const [deactivateMissing, setDeactivateMissing] = useState(false)

  useEffect(() => {
    capturePanelAccess('admin')
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [summaryData, recordData] = await Promise.all([
        apiGet('/api/admin/summary', 'admin'),
        apiGet('/api/admin/records', 'admin')
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

  async function readExcel(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setPreview(null)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
      if (!rawRows.length) throw new Error('El archivo no contiene estudiantes.')
      const actualHeaders = Object.keys(rawRows[0])
      if (!EXPECTED_HEADERS.some((header) => actualHeaders.includes(header))) throw new Error('El Excel no contiene los encabezados esperados.')
      const normalizedRows = normalizeSheetRows(rawRows)
      const result = await apiPost('/api/admin/import/preview', { rows: normalizedRows }, 'admin')
      setRows(normalizedRows)
      setFilename(file.name)
      setPreview(result)
      setDeactivateMissing(false)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function commitImport() {
    setImporting(true)
    setError('')
    try {
      await apiPost('/api/admin/import/commit', { rows, filename, deactivateMissing }, 'admin')
      setPreview(null)
      setRows([])
      setFilename('')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setImporting(false)
    }
  }

  async function exportReport() {
    try {
      const result = await apiGet('/api/admin/export', 'admin')
      const worksheet = XLSX.utils.json_to_sheet(result.rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprobantes')
      XLSX.writeFile(workbook, `reporte-comprobantes-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const submittedPercentage = useMemo(() => summary?.students ? Math.round((summary.submitted / summary.students) * 100) : 0, [summary])
  if (authorized === false) return <PanelAccessError panelName="Panel de administración" />

  return (
    <>
      <Header title="Panel de administración" subtitle="Gestión de estudiantes y seguimiento general" />
      <main className="page-shell">
        <div className="panel-heading">
          <div><span className="eyebrow">Control general</span><h2>Pago de incorporación</h2></div>
          <div className="action-row"><button className="button secondary" onClick={loadData} disabled={loading}><RefreshCw size={18} /> Actualizar</button><button className="button primary" onClick={exportReport}><Download size={18} /> Descargar Excel</button></div>
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <section className="metrics-grid admin-metrics">
          <article className="metric-card"><span>Estudiantes activos</span><strong>{summary?.students ?? '—'}</strong></article>
          <article className="metric-card"><span>Sin enviar</span><strong>{summary?.notSubmitted ?? '—'}</strong></article>
          <article className="metric-card"><span>Pendientes</span><strong>{summary?.pending ?? '—'}</strong></article>
          <article className="metric-card"><span>Correcciones</span><strong>{summary?.correctionRequested ?? '—'}</strong></article>
          <article className="metric-card"><span>Aprobados</span><strong>{summary?.approved ?? '—'}</strong></article>
          <article className="metric-card"><span>Avance</span><strong>{submittedPercentage}%</strong></article>
        </section>
        <section className="card import-card">
          <div><span className="eyebrow">Lista autorizada</span><h3>Importar estudiantes desde Excel</h3><p>Se agregarán estudiantes nuevos y se actualizarán los existentes usando la cédula como identificador único.</p></div>
          <label className="button primary file-button"><Upload size={18} /> Seleccionar Excel<input type="file" accept=".xlsx,.xls" onChange={readExcel} /></label>
        </section>
        {preview ? (
          <section className="card preview-card">
            <div className="panel-heading compact"><div><span className="eyebrow">Vista previa</span><h3>{filename}</h3></div><FileSpreadsheet size={34} /></div>
            <div className="preview-grid"><div><span>Filas válidas</span><strong>{preview.validRows}</strong></div><div><span>Nuevos</span><strong>{preview.newCount}</strong></div><div><span>Existentes</span><strong>{preview.updatedCount}</strong></div><div><span>Ausentes</span><strong>{preview.missingCount}</strong></div></div>
            {preview.invalidRows?.length ? <div className="alert alert-error">Hay {preview.invalidRows.length} filas inválidas. Corrige el Excel antes de continuar.</div> : <><label className="checkbox-row"><input type="checkbox" checked={deactivateMissing} onChange={(event) => setDeactivateMissing(event.target.checked)} />Desactivar estudiantes anteriores que no aparecen en este archivo</label><div className="modal-actions"><button className="button secondary" onClick={() => setPreview(null)}>Cancelar</button><button className="button primary" onClick={commitImport} disabled={importing}>{importing ? 'Importando...' : 'Confirmar importación'}</button></div></>}
          </section>
        ) : null}
        <section className="card">
          <div className="panel-heading compact"><div><span className="eyebrow">Últimos registros</span><h3>Comprobantes enviados</h3></div></div>
          <div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>Carrera</th><th>Banco</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>{records.slice(0, 25).map((record) => <tr key={record.id}><td><strong>{record.student.fullName}</strong><small>{record.student.identification}</small></td><td>{record.student.careerName || '—'}</td><td>{record.bank}</td><td>{record.submittedAt ? new Date(record.submittedAt).toLocaleString('es-EC') : '—'}</td><td><StatusBadge status={record.status} /></td></tr>)}{!records.length && !loading ? <tr><td colSpan="5" className="empty-cell">Todavía no hay comprobantes enviados.</td></tr> : null}</tbody></table></div>
        </section>
      </main>
    </>
  )
}
