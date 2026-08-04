import { createClient } from '@supabase/supabase-js'
import baseWorker from './index.js'

const RECEIPTS_BUCKET = 'receipts'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer'
    }
  })
}

function fail(message, status = 400) {
  return json({ error: message }, status)
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

function relationObject(value) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function adminAuthorized(request, env) {
  const provided = request.headers.get('x-panel-access') || ''
  return Boolean(env.ADMIN_ACCESS_TOKEN && provided === env.ADMIN_ACCESS_TOKEN)
}

async function resetReceipt(request, env, recordId) {
  if (!adminAuthorized(request, env)) return fail('Enlace no autorizado.', 401)

  const body = await request.json().catch(() => ({}))
  const confirmationIdentification = digitsOnly(body.identification)
  const supabase = getSupabase(env)

  const { data: record, error: recordError } = await supabase
    .from('payment_records')
    .select('id, student_id, status, current_file_path, students!inner(identification, full_name)')
    .eq('id', recordId)
    .maybeSingle()

  if (recordError) throw recordError
  if (!record) return fail('Comprobante no encontrado.', 404)

  const student = relationObject(record.students)
  if (!student?.identification) return fail('No se pudo identificar al estudiante.', 409)
  if (confirmationIdentification !== student.identification) {
    return fail('La cédula ingresada no coincide con el estudiante.', 400)
  }

  const { data: versions, error: versionsError } = await supabase
    .from('receipt_versions')
    .select('file_path')
    .eq('payment_record_id', recordId)

  if (versionsError) throw versionsError

  const filePaths = [...new Set([
    record.current_file_path,
    ...(versions || []).map((version) => version.file_path)
  ].filter(Boolean))]

  const { data: deleted, error: deleteError } = await supabase
    .from('payment_records')
    .delete()
    .eq('id', recordId)
    .select('id')
    .maybeSingle()

  if (deleteError) throw deleteError
  if (!deleted) return fail('El comprobante ya fue eliminado o cambió de estado.', 409)

  let storageCleanupWarning = false
  if (filePaths.length) {
    const { error: storageError } = await supabase.storage.from(RECEIPTS_BUCKET).remove(filePaths)
    if (storageError) {
      storageCleanupWarning = true
      console.error('No se pudieron eliminar todos los archivos del comprobante.', storageError)
    }
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    action: 'receipt_reset_by_admin',
    entity_type: 'payment_record',
    entity_id: recordId,
    metadata: {
      studentId: record.student_id,
      identification: student.identification,
      fullName: student.full_name,
      previousStatus: record.status,
      removedFiles: filePaths.length,
      storageCleanupWarning
    }
  })

  if (auditError) console.error('No se pudo guardar la auditoría del restablecimiento.', auditError)

  return json({
    success: true,
    message: 'El envío fue eliminado. El estudiante puede registrar un nuevo comprobante.',
    storageCleanupWarning
  })
}

export default {
  async fetch(request, env, context) {
    try {
      const url = new URL(request.url)
      const match = url.pathname.match(/^\/api\/admin\/records\/([0-9a-f-]+)\/reset$/i)
      if (request.method.toUpperCase() === 'POST' && match) {
        return await resetReceipt(request, env, match[1])
      }
      return await baseWorker.fetch(request, env, context)
    } catch (error) {
      console.error(error)
      return fail('Ocurrió un error interno. Inténtelo nuevamente.', 500)
    }
  }
}
