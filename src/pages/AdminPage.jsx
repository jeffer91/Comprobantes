import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileSpreadsheet, RefreshCw, Trash2, Upload } from 'lucide-react'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import Header from '../components/Header'
import PanelAccessError from '../components/PanelAccessError'
import StatusBadge from '../components/StatusBadge'
import { apiGet, apiPost, capturePanelAccess } from '../lib/api'
import './AdminPage.css'

const MAX_EXCEL_BYTES = 10 * 1024 * 1024
const CANONICAL_HEADERS = [
  'numeroIdentificacion',
  'Nombres',
  'CodigoCarrera',
  'NombreCarrera',
  'HorarioComplexivo',
  'CorreoPersonal',
  'CorreoInstitucional',
  'Celular',
  'Sede'
]

const HEADER_ALIASES = {
  numeroidentificacion: 'numeroIdentificacion',
  numerodeidentificacion: 'numeroIdentificacion',
  identificacion: 'numeroIdentificacion',
  cedula: 'numeroIdentificacion',
  numerocedula: 'numeroIdentificacion',
  nombres: 'Nombres',
  nombre: 'Nombres',
  nombrescompletos: 'Nombres',
  estudiante: 'Nombres',
  codigocarrera: 'CodigoCarrera',
  nombrecarrera: 'NombreCarrera',
  carrera: 'NombreCarrera',
  horariocomplexivo: 'HorarioComplexivo',
  horario: 'HorarioComplexivo',
  correopersonal: 'CorreoPersonal',
  correoinstitucional: 'CorreoInstitucional',
  celular: 'Celular',
  telefono: 'Celular',
  movil: 'Celular',
  sede: 'Sede',
  campus: 'Sede'
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function serializeCell(value) {
  if (value instanceof Date) return value.toISOString()
  return value ?? ''
}

function parseSheetRows(sheetRows) {
  if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
    throw new Error('El archivo no contiene estudiantes.')
  }

  const mappedHeaders = sheetRows[0].map((value) => HEADER_ALIASES[normalizeHeader(value)] || null)
  const hasIdentification = mappedHeaders.includes('numeroIdentificacion')
  const hasNames = mappedHeaders.includes('Nombres')
  if (!hasIdentification || !hasNames) {
    throw new Error('El Excel debe incluir las columnas de cédula y nombres.')
  }

  const rows = sheetRows
    .slice(1)
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()))
    .map((row) => {
      const object = Object.fromEntries(CANONICAL_HEADERS.map((header) => [header, '']))
      mappedHeaders.forEach((header, index) => {
        if (header) object[header] = serializeCell(row[index])
      })
      return object
    })

  if (!rows.length) throw new Error('El archivo no contiene estudiantes.')
  return rows
}

function clearImportState(setPreview, setRows, setFilename, setDeactivateMissing) {
  setPreview(null)
  setRows([])
  setFilename('')
  setDeactivateMissing(false)
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(null)
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const [rows, setRows] = useState([])
  const [filename, setFilename] = useState('')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deactivateMissing, setDeactivateMissing] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resettingId, setResettingId] = useState('')

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
    setNotice('')
    clearImportState(setPreview, setRows, setFilename, setDeactivateMissing)

    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('Seleccione un archivo de Excel en formato .xlsx.')
      }
      if (file.size > MAX_EXCEL_BYTES) {
        throw new Error('El archivo de estudiantes supera el límite de 10 MB.')
      }

      const sheetRows = await readSheet(file)
      const normalizedRows = parseSheetRows(sheetRows)
      const result = await apiPost('/api/admin/import/preview', { rows: normalizedRows }, 'admin')
      setRows(normalizedRows)
      setFilename(file.name)
      setPreview(result)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo leer el archivo de Excel.')
    }
  }

  async function commitImport() {
    if (!preview || preview.invalidRows?.length) return
    setImporting(true)
    setError('')
    setNotice('')
    try {
      await apiPost('/api/admin/import/commit', { rows, filename, deactivateMissing }, 'admin')
      clearImportState(setPreview, setRows, setFilename, setDeactivateMissing)
      setNotice('La lista de estudiantes se actualizó correctamente.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setImporting(false)
    }
  }

  async function exportReport() {
    setExporting(true)
    setError('')
    try {
      const result = await apiGet('/api/admin/export', 'admin')
      if (!result.rows?.length) throw new Error('No existen datos para exportar.')

      const headers = Object.keys(result.rows[0])
      const sheetData = [
        headers.map((header) => ({ value: header, fontWeight: 'bold' })),
        ...result.rows.map((row) => headers.map((header) => row[header] ?? ''))
      ]
      await writeExcelFile(sheetData, {
        sheet: 'Comprobantes',
        stickyRowsCount: 1,
        columns: headers.map((header) => ({ width: Math.min(32, Math.max(14, header.length + 2)) }))
      }).toFile(`reporte-comprobantes-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setExporting(false)
    }
  }

  async function openReceipt(recordId) {
    const popup = window.open('about:blank', '_blank')
    if (!popup) {
      setError('El navegador bloqueó la nueva ventana. Habilite las ventanas emergentes e inténtelo nuevamente.')
      return
    }
    popup.opener = null
    try {
      const result = await apiPost(`/api/admin/records/${recordId}/signed-url`, {}, 'admin')
      popup.location.replace(result.url)
    } catch (requestError) {
      popup.close()
      setError(requestError.message)
    }
  }

  async function resetReceipt(event) {
    event.preventDefault()
    if (!resetTarget) return

    const identification = resetTarget.identification.trim()
    if (identification !== resetTarget.record.student.identification) return

    setResettingId(resetTarget.record.id)
    setError('')
    setNotice('')
    try {
      const result = await apiPost(
        `/api/admin/records/${resetTarget.record.id}/reset`,
        { identification },
        'admin'
      )
      setResetTarget(null)
      setNotice(result.message)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setResettingId('')
    }
  }

  const submittedPercentage = useMemo(
    () => summary?.students ? Math.round((summary.submitted / summary.students) * 100) : 0,
    [summary]
  )

  const resetConfirmed = Boolean(
    resetTarget && resetTarget.identification.trim() === resetTarget.record.student.identification
  )

  if (authorized === false) return <PanelAccessError panelName="Panel de administración" />

  return (
    <>
      <Header title="Panel de administración" subtitle="Gestión de estudiantes y seguimiento general" />
      <main className="page-shell">
        <div className="panel-heading">
          <div><span className="eyebrow">Control general</span><h2>Pago de incorporación</h2></div>
          <div className="action-row">
            <button className="button secondary" onClick={loadData} disabled={loading}><RefreshCw size={18} /> Actualizar</button>
            <button className="button primary" onClick={exportReport} disabled={exporting}><Download size={18} /> {exporting ? 'Generando...' : 'Descargar Excel'}</button>
          </div>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? <div className="alert alert-success">{notice}</div> : null}

        <section className="metrics-grid admin-metrics">
          <article className="metric-card"><span>Total habilitados</span><strong>{summary?.students ?? '—'}</strong></article>
          <article className="metric-card metric-received"><span>Han enviado</span><strong>{summary?.submitted ?? '—'}</strong></article>
          <article className="metric-card metric-missing"><span>Faltan por enviar</span><strong>{summary?.notSubmitted ?? '—'}</strong></article>
          <article className="metric-card"><span>Pendientes</span><strong>{summary?.pending ?? '—'}</strong></article>
          <article className="metric-card"><span>Correcciones</span><strong>{summary?.correctionRequested ?? '—'}</strong></article>
          <article className="metric-card"><span>Aprobados</span><strong>{summary?.approved ?? '—'}</strong></article>
        </section>

        <section className="card progress-card" aria-label="Avance de recepción de comprobantes">
          <div className="progress-heading">
            <div>
              <span className="eyebrow">Avance de recepción</span>
              <h3>Comprobantes recibidos</h3>
            </div>
            <strong>{submittedPercentage}%</strong>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={submittedPercentage}>
            <span style={{ width: `${submittedPercentage}%` }} />
          </div>
          <div className="progress-copy">
            <span><strong>{summary?.submitted ?? 0}</strong> de <strong>{summary?.students ?? 0}</strong> estudiantes ya enviaron.</span>
            <span>Faltan <strong>{summary?.notSubmitted ?? 0}</strong> estudiantes.</span>
          </div>
        </section>

        <section className="card import-card">
          <div>
            <span className="eyebrow">Lista autorizada</span>
            <h3>Importar estudiantes desde Excel</h3>
            <p>Se agregarán estudiantes nuevos y se actualizarán los existentes usando la cédula como identificador único.</p>
          </div>
          <label className="button primary file-button"><Upload size={18} /> Seleccionar Excel<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readExcel} /></label>
        </section>

        {preview ? (
          <section className="card preview-card">
            <div className="panel-heading compact"><div><span className="eyebrow">Vista previa</span><h3>{filename}</h3></div><FileSpreadsheet size={34} /></div>
            <div className="preview-grid">
              <div><span>Filas válidas</span><strong>{preview.validRows}</strong></div>
              <div><span>Nuevos</span><strong>{preview.newCount}</strong></div>
              <div><span>Existentes</span><strong>{preview.updatedCount}</strong></div>
              <div><span>Ausentes</span><strong>{preview.missingCount}</strong></div>
            </div>
            {preview.invalidRows?.length ? (
              <div className="alert alert-error">Hay {preview.invalidRows.length} filas inválidas. Corrige el Excel antes de continuar.</div>
            ) : (
              <>
                <label className="checkbox-row"><input type="checkbox" checked={deactivateMissing} onChange={(event) => setDeactivateMissing(event.target.checked)} />Desactivar estudiantes anteriores que no aparecen en este archivo</label>
                <div className="modal-actions">
                  <button className="button secondary" onClick={() => clearImportState(setPreview, setRows, setFilename, setDeactivateMissing)}>Cancelar</button>
                  <button className="button primary" onClick={commitImport} disabled={importing}>{importing ? 'Importando...' : 'Confirmar importación'}</button>
                </div>
              </>
            )}
          </section>
        ) : null}

        <section className="card">
          <div className="panel-heading compact"><div><span className="eyebrow">Registros</span><h3>Comprobantes enviados</h3></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Estudiante</th><th>Carrera</th><th>Banco</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td><strong>{record.student.fullName}</strong><small>{record.student.identification}</small></td>
                    <td>{record.student.careerName || '—'}</td>
                    <td>{record.bank}</td>
                    <td>{record.submittedAt ? new Date(record.submittedAt).toLocaleString('es-EC') : '—'}</td>
                    <td><StatusBadge status={record.status} /></td>
                    <td>
                      <div className="action-row">
                        <button className="icon-button" title="Ver comprobante" onClick={() => openReceipt(record.id)} disabled={resettingId === record.id}><Eye size={18} /></button>
                        <button
                          className="icon-button danger"
                          title="Restablecer comprobante"
                          onClick={() => setResetTarget({ record, identification: '' })}
                          disabled={resettingId === record.id}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!records.length && !loading ? <tr><td colSpan="6" className="empty-cell">Todavía no hay comprobantes enviados.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {resetTarget ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !resettingId && setResetTarget(null)}>
          <form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-title" onSubmit={resetReceipt} onMouseDown={(event) => event.stopPropagation()}>
            <h3 id="reset-title">Restablecer comprobante</h3>
            <p>
              Se eliminará el envío de <strong>{resetTarget.record.student.fullName}</strong> y el estudiante volverá al estado <strong>Sin enviar</strong>.
            </p>
            {resetTarget.record.status === 'approved' ? (
              <div className="alert alert-warning">Este comprobante ya está aprobado. Confirma cuidadosamente antes de eliminarlo.</div>
            ) : null}
            <div className="reset-details">
              <span>Estado actual</span><StatusBadge status={resetTarget.record.status} />
            </div>
            <label className="confirmation-field">
              Escribe la cédula <strong>{resetTarget.record.student.identification}</strong> para confirmar
              <input
                autoFocus
                inputMode="numeric"
                maxLength="10"
                value={resetTarget.identification}
                onChange={(event) => setResetTarget((current) => ({
                  ...current,
                  identification: event.target.value.replace(/\D/g, '').slice(0, 10)
                }))}
                disabled={Boolean(resettingId)}
                required
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setResetTarget(null)} disabled={Boolean(resettingId)}>Cancelar</button>
              <button className="button danger-button" disabled={!resetConfirmed || Boolean(resettingId)}>
                <Trash2 size={18} /> {resettingId ? 'Eliminando...' : 'Eliminar envío'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
