import { useMemo, useState } from 'react'
import { CheckCircle2, FileUp, Search, ShieldCheck, Smartphone } from 'lucide-react'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import { apiPost } from '../lib/api'
import { BANKS, SUPPORT_WHATSAPP } from '../lib/constants'

const EMPTY_FORM = {
  bank: '',
  otherBank: '',
  paymentDate: '',
  referenceNumber: '',
  referenceUnavailable: false,
  file: null
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])

function normalizeIdentification(value) {
  return value.replace(/\D/g, '').slice(0, 10)
}

function todayInEcuador() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export default function StudentPage() {
  const [identification, setIdentification] = useState('')
  const [lookup, setLookup] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const maxPaymentDate = useMemo(() => todayInEcuador(), [])
  const canSubmit = useMemo(() => {
    const bank = form.bank === 'Otro' ? form.otherBank.trim() : form.bank
    return Boolean(bank && form.paymentDate && (form.referenceUnavailable || form.referenceNumber.trim()) && form.file)
  }, [form])

  async function handleLookup(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLookup(null)
    setForm(EMPTY_FORM)

    if (identification.length !== 10) {
      setError('Ingrese una cédula de 10 dígitos.')
      return
    }

    setLoading(true)
    try {
      setLookup(await apiPost('/api/student/lookup', { identification }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!canSubmit) {
      setError('Complete todos los datos obligatorios y seleccione el comprobante.')
      return
    }

    const bank = form.bank === 'Otro' ? form.otherBank.trim() : form.bank
    const body = new FormData()
    body.append('identification', identification)
    body.append('bank', bank)
    body.append('paymentDate', form.paymentDate)
    body.append('referenceNumber', form.referenceNumber.trim())
    body.append('referenceUnavailable', String(form.referenceUnavailable))
    body.append('file', form.file)

    setSubmitting(true)
    try {
      const result = await apiPost('/api/student/submit', body)
      setMessage(result.message || 'Comprobante enviado correctamente.')
      setLookup({ found: true, payment: { status: 'pending' } })
      setForm(EMPTY_FORM)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function resetSearch() {
    setLookup(null)
    setMessage('')
    setError('')
    setIdentification('')
    setForm(EMPTY_FORM)
  }

  function selectFile(event) {
    const file = event.target.files?.[0] || null
    setError('')
    if (file && !ALLOWED_TYPES.has(file.type)) {
      event.target.value = ''
      setForm((current) => ({ ...current, file: null }))
      setError('El comprobante debe ser una imagen JPG, PNG o un archivo PDF.')
      return
    }
    setForm((current) => ({ ...current, file }))
  }

  const payment = lookup?.payment
  const canUpload = lookup?.student && (!payment || payment.status === 'correction_requested')

  return (
    <>
      <Header title="Comprobante de incorporación" subtitle="Registro y consulta del pago de incorporación" />
      <main className="page-shell narrow-shell">
        <section className="intro-grid">
          <div>
            <span className="eyebrow">Proceso estudiantil</span>
            <h2>Registra tu comprobante en pocos pasos</h2>
            <p>Ingresa tu cédula. El sistema verificará que constes en la lista habilitada antes de permitir el envío.</p>
          </div>
          <div className="trust-list">
            <span><ShieldCheck size={20} /> Información protegida</span>
            <span><Smartphone size={20} /> Funciona desde el celular</span>
            <span><CheckCircle2 size={20} /> Consulta de estado</span>
          </div>
        </section>

        <section className="card">
          <form onSubmit={handleLookup} className="lookup-form">
            <label htmlFor="identification">Número de cédula</label>
            <div className="input-action-row">
              <input id="identification" inputMode="numeric" autoComplete="off" placeholder="Ejemplo: 1712345678" value={identification} onChange={(event) => setIdentification(normalizeIdentification(event.target.value))} disabled={loading || Boolean(lookup)} />
              {lookup ? <button type="button" className="button secondary" onClick={resetSearch}>Otra cédula</button> : <button className="button primary" disabled={loading}><Search size={18} /> {loading ? 'Consultando...' : 'Consultar'}</button>}
            </div>
          </form>
          {error ? <div className="alert alert-error">{error}</div> : null}
          {message ? <div className="alert alert-success">{message}</div> : null}
        </section>

        {lookup?.found === false ? (
          <section className="card empty-state">
            <h3>No consta en la lista de estudiantes habilitados</h3>
            <p>Comunícate con soporte por WhatsApp al <strong>{SUPPORT_WHATSAPP}</strong> para revisar tu caso.</p>
            <a className="button whatsapp" href={`https://wa.me/593${SUPPORT_WHATSAPP.slice(1)}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
          </section>
        ) : null}

        {payment && !canUpload ? (
          <section className="card status-card">
            <span className="eyebrow">Estado del comprobante</span>
            <StatusBadge status={payment.status} />
            {payment.status === 'pending' ? <p>Tu comprobante fue recibido y está pendiente de revisión.</p> : null}
            {payment.status === 'approved' ? <p>Tu comprobante fue revisado y aprobado.</p> : null}
          </section>
        ) : null}

        {canUpload ? (
          <section className="card">
            <div className="student-summary">
              <div><span className="eyebrow">Estudiante habilitado</span><h3>{lookup.student.fullName}</h3></div>
              <dl><div><dt>Carrera</dt><dd>{lookup.student.careerName || 'No registrada'}</dd></div><div><dt>Sede</dt><dd>{lookup.student.campus || 'No registrada'}</dd></div></dl>
            </div>
            {payment?.status === 'correction_requested' ? <div className="alert alert-warning"><strong>Se solicitó una corrección.</strong><span>{payment.correctionReason}</span></div> : null}
            <form className="payment-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>Banco o cooperativa<select value={form.bank} onChange={(event) => setForm((current) => ({ ...current, bank: event.target.value }))} required><option value="">Selecciona una opción</option>{BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select></label>
                {form.bank === 'Otro' ? <label>Nombre de la entidad<input value={form.otherBank} onChange={(event) => setForm((current) => ({ ...current, otherBank: event.target.value }))} maxLength={100} required /></label> : null}
                <label>Fecha del pago<input type="date" value={form.paymentDate} max={maxPaymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} required /></label>
                <label>Número de transacción o referencia<input value={form.referenceNumber} onChange={(event) => setForm((current) => ({ ...current, referenceNumber: event.target.value }))} maxLength={100} disabled={form.referenceUnavailable} required={!form.referenceUnavailable} /></label>
              </div>
              <label className="checkbox-row"><input type="checkbox" checked={form.referenceUnavailable} onChange={(event) => setForm((current) => ({ ...current, referenceUnavailable: event.target.checked, referenceNumber: event.target.checked ? '' : current.referenceNumber }))} />El comprobante no muestra un número de referencia</label>
              <label className="file-drop"><FileUp size={28} /><strong>{form.file ? form.file.name : 'Seleccionar comprobante'}</strong><span>JPG, JPEG, PNG o PDF</span><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={selectFile} required /></label>
              <button className="button primary full-width" disabled={!canSubmit || submitting}>{submitting ? 'Enviando comprobante...' : payment ? 'Enviar comprobante corregido' : 'Enviar comprobante'}</button>
            </form>
          </section>
        ) : null}
      </main>
      <footer className="site-footer">ITSQMET · Formando profesionales de élite</footer>
    </>
  )
}
