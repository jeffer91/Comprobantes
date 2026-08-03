import { createClient } from '@supabase/supabase-js'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const RECEIPTS_BUCKET = 'receipts'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

function fail(message, status = 400, details) {
  return json({ error: message, ...(details ? { details } : {}) }, status)
}

function getSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan los secretos de Supabase en Cloudflare.')
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
}

function normalizeIdentification(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length <= 10 ? digits.padStart(10, '0') : digits.slice(0, 10)
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length <= 10 ? digits.padStart(10, '0') : digits.slice(0, 15)
}

function cleanText(value, maxLength = 250) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : null
}

function validateDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function panelAuthorized(request, env, panel) {
  const provided = request.headers.get('x-panel-access') || ''
  const expected = panel === 'admin' ? env.ADMIN_ACCESS_TOKEN : env.COLLECTIONS_ACCESS_TOKEN
  return Boolean(expected && provided && provided === expected)
}

function requirePanel(request, env, panel) {
  if (!panelAuthorized(request, env, panel)) return fail('Enlace no autorizado.', 401)
  return null
}

function extensionFor(file) {
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'image/png') return 'png'
  return 'jpg'
}

function relationObject(value) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function mapRecord(record) {
  const student = relationObject(record.students)
  return {
    id: record.id,
    status: record.status,
    bank: record.bank,
    paymentDate: record.payment_date,
    referenceNumber: record.reference_number,
    submittedAt: record.submitted_at,
    approvedAt: record.approved_at,
    correctionReason: record.correction_reason,
    currentVersion: record.current_version,
    student: {
      id: student?.id,
      identification: student?.identification,
      fullName: student?.full_name,
      careerName: student?.career_name,
      campus: student?.campus
    }
  }
}

function normalizeImportRows(rows) {
  const normalized = []
  const invalidRows = []
  const seen = new Set()

  rows.forEach((row, index) => {
    const identification = normalizeIdentification(row.numeroIdentificacion)
    const fullName = cleanText(row.Nombres, 200)

    if (!/^\d{10}$/.test(identification) || !fullName) {
      invalidRows.push({ row: index + 2, reason: 'Cédula o nombres incompletos.' })
      return
    }

    if (seen.has(identification)) {
      invalidRows.push({ row: index + 2, reason: `Cédula duplicada: ${identification}.` })
      return
    }

    seen.add(identification)
    normalized.push({
      identification,
      full_name: fullName,
      career_code: cleanText(row.CodigoCarrera, 50),
      career_name: cleanText(row.NombreCarrera, 200),
      schedule: cleanText(row.HorarioComplexivo, 100),
      personal_email: cleanText(row.CorreoPersonal, 200)?.toLowerCase() || null,
      institutional_email: cleanText(row.CorreoInstitucional, 200)?.toLowerCase() || null,
      phone: normalizePhone(row.Celular),
      campus: cleanText(row.Sede, 100),
      active: true
    })
  })

  return { normalized, invalidRows }
}

async function buildSummary(supabase) {
  const [{ data: students, error: studentError }, { data: records, error: recordError }] = await Promise.all([
    supabase.from('students').select('id').eq('active', true),
    supabase.from('payment_records').select('student_id,status')
  ])
  if (studentError) throw studentError
  if (recordError) throw recordError

  const activeIds = new Set((students || []).map((row) => row.id))
  const activeRecords = (records || []).filter((row) => activeIds.has(row.student_id))
  const count = (status) => activeRecords.filter((row) => row.status === status).length

  return {
    students: activeIds.size,
    submitted: activeRecords.length,
    notSubmitted: Math.max(0, activeIds.size - activeRecords.length),
    pending: count('pending'),
    correctionRequested: count('correction_requested'),
    approved: count('approved'),
    total: activeRecords.length
  }
}

async function listRecords(supabase) {
  const { data, error } = await supabase
    .from('payment_records')
    .select(`
      id,
      status,
      bank,
      payment_date,
      reference_number,
      submitted_at,
      approved_at,
      correction_reason,
      current_version,
      current_file_path,
      students!inner(id, identification, full_name, career_name, campus, active)
    `)
    .order('submitted_at', { ascending: false })
    .limit(1000)

  if (error) throw error
  return (data || [])
    .filter((row) => relationObject(row.students)?.active !== false)
    .map(mapRecord)
}

async function studentLookup(request, env) {
  const body = await request.json().catch(() => ({}))
  const identification = normalizeIdentification(body.identification)
  if (!/^\d{10}$/.test(identification)) return fail('Ingrese una cédula válida de 10 dígitos.')

  const supabase = getSupabase(env)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, identification, full_name, career_name, campus')
    .eq('identification', identification)
    .eq('active', true)
    .maybeSingle()

  if (studentError) throw studentError
  if (!student) return json({ found: false })

  const { data: payment, error: paymentError } = await supabase
    .from('payment_records')
    .select('status, correction_reason')
    .eq('student_id', student.id)
    .maybeSingle()

  if (paymentError) throw paymentError

  if (payment && payment.status !== 'correction_requested') {
    return json({ found: true, payment: { status: payment.status } })
  }

  return json({
    found: true,
    student: {
      identification: student.identification,
      fullName: student.full_name,
      careerName: student.career_name,
      campus: student.campus
    },
    payment: payment ? {
      status: payment.status,
      correctionReason: payment.correction_reason
    } : null
  })
}

async function submitReceipt(request, env) {
  const form = await request.formData()
  const identification = normalizeIdentification(form.get('identification'))
  const bank = cleanText(form.get('bank'), 120)
  const paymentDate = String(form.get('paymentDate') || '')
  const referenceUnavailable = String(form.get('referenceUnavailable')) === 'true'
  const referenceNumber = referenceUnavailable ? null : cleanText(form.get('referenceNumber'), 120)
  const file = form.get('file')

  if (!/^\d{10}$/.test(identification)) return fail('Cédula inválida.')
  if (!bank || !validateDate(paymentDate)) return fail('Complete el banco y la fecha del pago.')
  if (!referenceUnavailable && !referenceNumber) return fail('Ingrese la referencia o marque que no consta.')
  if (!(file instanceof File) || !file.size) return fail('Seleccione una imagen o PDF.')
  if (!ALLOWED_TYPES.has(file.type)) return fail('El archivo debe ser JPG, JPEG, PNG o PDF.')

  const maxMb = Number(env.MAX_UPLOAD_MB || 20)
  const maxBytes = Math.max(1, maxMb) * 1024 * 1024
  if (file.size > maxBytes) return fail(`El comprobante supera el límite técnico de ${maxMb} MB.`)

  const supabase = getSupabase(env)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('identification', identification)
    .eq('active', true)
    .maybeSingle()

  if (studentError) throw studentError
  if (!student) return fail('La cédula no consta en la lista habilitada.', 404)

  const { data: current, error: currentError } = await supabase
    .from('payment_records')
    .select('id,status,current_version')
    .eq('student_id', student.id)
    .maybeSingle()

  if (currentError) throw currentError
  if (current && current.status !== 'correction_requested') {
    return fail('Ya existe un comprobante registrado para esta cédula.', 409)
  }

  const recordId = current?.id || crypto.randomUUID()
  const version = (current?.current_version || 0) + 1
  const filePath = `${student.id}/${recordId}/v${version}-${Date.now()}.${extensionFor(file)}`

  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false
    })
  if (uploadError) throw uploadError

  const recordPayload = {
    id: recordId,
    student_id: student.id,
    status: 'pending',
    bank,
    payment_date: paymentDate,
    reference_number: referenceNumber,
    reference_unavailable: referenceUnavailable,
    current_file_path: filePath,
    current_version: version,
    correction_reason: null,
    submitted_at: new Date().toISOString(),
    approved_at: null
  }

  const recordQuery = current
    ? supabase.from('payment_records').update(recordPayload).eq('id', recordId)
    : supabase.from('payment_records').insert(recordPayload)
  const { error: recordError } = await recordQuery

  if (recordError) {
    await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
    throw recordError
  }

  const { error: versionError } = await supabase.from('receipt_versions').insert({
    payment_record_id: recordId,
    version,
    file_path: filePath,
    file_name: cleanText(file.name, 255),
    mime_type: file.type,
    file_size: file.size
  })
  if (versionError) throw versionError

  await supabase.from('audit_logs').insert({
    action: current ? 'receipt_corrected' : 'receipt_submitted',
    entity_type: 'payment_record',
    entity_id: recordId,
    metadata: { version, identification }
  })

  return json({ message: 'Comprobante enviado correctamente.', recordId }, 201)
}

async function panelSummary(request, env, panel) {
  const unauthorized = requirePanel(request, env, panel)
  if (unauthorized) return unauthorized
  return json(await buildSummary(getSupabase(env)))
}

async function panelRecords(request, env, panel) {
  const unauthorized = requirePanel(request, env, panel)
  if (unauthorized) return unauthorized
  return json({ records: await listRecords(getSupabase(env)) })
}

async function approveRecord(request, env, id) {
  const unauthorized = requirePanel(request, env, 'collections')
  if (unauthorized) return unauthorized
  const supabase = getSupabase(env)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('payment_records')
    .update({ status: 'approved', approved_at: now, correction_reason: null })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) return fail('Comprobante no encontrado.', 404)
  await supabase.from('audit_logs').insert({ action: 'receipt_approved', entity_type: 'payment_record', entity_id: id })
  return json({ success: true })
}

async function requestCorrection(request, env, id) {
  const unauthorized = requirePanel(request, env, 'collections')
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => ({}))
  const reason = cleanText(body.reason, 500)
  if (!reason) return fail('Escriba el motivo de la corrección.')
  const supabase = getSupabase(env)
  const { data, error } = await supabase
    .from('payment_records')
    .update({ status: 'correction_requested', correction_reason: reason, approved_at: null })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) return fail('Comprobante no encontrado.', 404)
  await supabase.from('audit_logs').insert({
    action: 'receipt_correction_requested',
    entity_type: 'payment_record',
    entity_id: id,
    metadata: { reason }
  })
  return json({ success: true })
}

async function signedUrl(request, env, panel, id) {
  const unauthorized = requirePanel(request, env, panel)
  if (unauthorized) return unauthorized
  const supabase = getSupabase(env)
  const { data: record, error } = await supabase
    .from('payment_records')
    .select('current_file_path')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!record) return fail('Comprobante no encontrado.', 404)
  const { data, error: signError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(record.current_file_path, 300)
  if (signError) throw signError
  return json({ url: data.signedUrl })
}

async function importPreview(request, env) {
  const unauthorized = requirePanel(request, env, 'admin')
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => ({}))
  if (!Array.isArray(body.rows)) return fail('No se recibieron filas del Excel.')
  const { normalized, invalidRows } = normalizeImportRows(body.rows)
  const supabase = getSupabase(env)
  const { data: current, error } = await supabase.from('students').select('identification').limit(5000)
  if (error) throw error
  const currentSet = new Set((current || []).map((row) => row.identification))
  const incomingSet = new Set(normalized.map((row) => row.identification))
  return json({
    validRows: normalized.length,
    invalidRows,
    newCount: normalized.filter((row) => !currentSet.has(row.identification)).length,
    updatedCount: normalized.filter((row) => currentSet.has(row.identification)).length,
    missingCount: (current || []).filter((row) => !incomingSet.has(row.identification)).length
  })
}

async function importCommit(request, env) {
  const unauthorized = requirePanel(request, env, 'admin')
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => ({}))
  if (!Array.isArray(body.rows)) return fail('No se recibieron filas del Excel.')
  const { normalized, invalidRows } = normalizeImportRows(body.rows)
  if (invalidRows.length) return fail('El Excel contiene filas inválidas.', 400, invalidRows)
  if (!normalized.length) return fail('El Excel no contiene estudiantes válidos.')

  const supabase = getSupabase(env)
  const { data: current, error: currentError } = await supabase
    .from('students')
    .select('id, identification')
    .limit(5000)
  if (currentError) throw currentError

  const currentSet = new Set((current || []).map((row) => row.identification))
  const incomingSet = new Set(normalized.map((row) => row.identification))
  const newCount = normalized.filter((row) => !currentSet.has(row.identification)).length
  const updatedCount = normalized.length - newCount
  const missing = (current || []).filter((row) => !incomingSet.has(row.identification))

  const importId = crypto.randomUUID()
  const { error: importError } = await supabase.from('student_imports').insert({
    id: importId,
    file_name: cleanText(body.filename, 255) || 'estudiantes.xlsx',
    total_rows: normalized.length,
    new_count: newCount,
    updated_count: updatedCount,
    missing_count: missing.length,
    deactivate_missing: Boolean(body.deactivateMissing)
  })
  if (importError) throw importError

  const payload = normalized.map((row) => ({ ...row, source_import_id: importId }))
  const { error: upsertError } = await supabase
    .from('students')
    .upsert(payload, { onConflict: 'identification' })
  if (upsertError) throw upsertError

  if (body.deactivateMissing && missing.length) {
    const ids = missing.map((row) => row.id)
    const { error: deactivateError } = await supabase
      .from('students')
      .update({ active: false })
      .in('id', ids)
    if (deactivateError) throw deactivateError
  }

  await supabase.from('audit_logs').insert({
    action: 'students_imported',
    entity_type: 'student_import',
    entity_id: importId,
    metadata: { total: normalized.length, newCount, updatedCount, missingCount: missing.length }
  })

  return json({ success: true, importId, total: normalized.length })
}

async function exportRows(request, env) {
  const unauthorized = requirePanel(request, env, 'admin')
  if (unauthorized) return unauthorized
  const supabase = getSupabase(env)
  const { data, error } = await supabase
    .from('students')
    .select(`
      identification,
      full_name,
      career_code,
      career_name,
      schedule,
      personal_email,
      institutional_email,
      phone,
      campus,
      active,
      payment_records(status, bank, payment_date, reference_number, submitted_at, approved_at, correction_reason, id)
    `)
    .order('full_name', { ascending: true })
    .limit(5000)
  if (error) throw error

  const rows = (data || []).map((student) => {
    const payment = relationObject(student.payment_records)
    return {
      Cédula: student.identification,
      Nombres: student.full_name,
      'Código de carrera': student.career_code || '',
      Carrera: student.career_name || '',
      Horario: student.schedule || '',
      'Correo personal': student.personal_email || '',
      'Correo institucional': student.institutional_email || '',
      Celular: student.phone || '',
      Sede: student.campus || '',
      Activo: student.active ? 'Sí' : 'No',
      Estado: payment?.status || 'not_submitted',
      Banco: payment?.bank || '',
      Referencia: payment?.reference_number || '',
      'Fecha del pago': payment?.payment_date || '',
      'Fecha de envío': payment?.submitted_at || '',
      'Fecha de aprobación': payment?.approved_at || '',
      'Motivo de corrección': payment?.correction_reason || '',
      'ID del comprobante': payment?.id || ''
    }
  })
  return json({ rows })
}

async function handleApi(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method.toUpperCase()

  if (method === 'GET' && path === '/api/health') return json({ ok: true })
  if (method === 'POST' && path === '/api/student/lookup') return studentLookup(request, env)
  if (method === 'POST' && path === '/api/student/submit') return submitReceipt(request, env)

  if (method === 'GET' && path === '/api/collections/summary') return panelSummary(request, env, 'collections')
  if (method === 'GET' && path === '/api/collections/records') return panelRecords(request, env, 'collections')
  if (method === 'GET' && path === '/api/admin/summary') return panelSummary(request, env, 'admin')
  if (method === 'GET' && path === '/api/admin/records') return panelRecords(request, env, 'admin')
  if (method === 'GET' && path === '/api/admin/export') return exportRows(request, env)
  if (method === 'POST' && path === '/api/admin/import/preview') return importPreview(request, env)
  if (method === 'POST' && path === '/api/admin/import/commit') return importCommit(request, env)

  let match = path.match(/^\/api\/collections\/records\/([0-9a-f-]+)\/approve$/i)
  if (method === 'POST' && match) return approveRecord(request, env, match[1])
  match = path.match(/^\/api\/collections\/records\/([0-9a-f-]+)\/correction$/i)
  if (method === 'POST' && match) return requestCorrection(request, env, match[1])
  match = path.match(/^\/api\/(collections|admin)\/records\/([0-9a-f-]+)\/signed-url$/i)
  if (method === 'POST' && match) return signedUrl(request, env, match[1], match[2])

  return fail('Ruta no encontrada.', 404)
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env)
      return env.ASSETS.fetch(request)
    } catch (error) {
      console.error(error)
      return fail('Ocurrió un error interno. Inténtelo nuevamente.', 500)
    }
  }
}
