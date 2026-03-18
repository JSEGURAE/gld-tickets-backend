const { PrismaClient } = require('@prisma/client')
const https = require('https')

const prisma = new PrismaClient()

const PRIORITY_LABELS = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' }
const PRIORITY_EMOJI  = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }
const PRIORITY_STYLES = {
  LOW:      'background:#e2e8f0;color:#475569;padding:2px 10px;border-radius:20px;font-size:13px',
  MEDIUM:   'background:#cffafe;color:#0e7490;padding:2px 10px;border-radius:20px;font-size:13px',
  HIGH:     'background:#ffedd5;color:#c2410c;padding:2px 10px;border-radius:20px;font-size:13px',
  CRITICAL: 'background:#ffe4e6;color:#be123c;padding:2px 10px;border-radius:20px;font-size:13px;font-weight:700',
}

// ─── Brevo API HTTP ───────────────────────────────────────────────────────────

async function brevoSend(to, subject, html) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) { console.log('⚠️  Brevo no configurado.'); return }

  const toList = Array.isArray(to) ? to : [to]
  const body = JSON.stringify({
    sender: { name: 'GLD Service Portal', email: process.env.BREVO_SENDER_EMAIL || 'js.chatjpt@gmail.com' },
    to: toList.map(email => ({ email })),
    subject,
    htmlContent: html,
  })

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`📧 Email enviado a: ${toList.join(', ')}`)
        } else {
          console.error(`❌ Brevo error ${res.statusCode}:`, data)
        }
        resolve()
      })
    })
    req.on('error', err => { console.error('❌ Brevo request error:', err.message); resolve() })
    req.write(body)
    req.end()
  })
}


function buildTicketHtml(ticket, requestorName) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const priorityLabel = PRIORITY_LABELS[ticket.priority] || ticket.priority
  const priorityEmoji = PRIORITY_EMOJI[ticket.priority] || '🎫'
  const priorityColors = {
    LOW:      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    MEDIUM:   { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    HIGH:     { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    CRITICAL: { bg: '#fff1f2', color: '#be123c', border: '#fecdd3' },
  }
  const pc = priorityColors[ticket.priority] || priorityColors.MEDIUM
  const date = new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">

    <!-- Logo / Brand -->
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:10px 22px;border-radius:30px">
        <span style="color:white;font-size:13px;font-weight:700;letter-spacing:0.05em">GLD SERVICE PORTAL</span>
      </div>
    </div>

    <!-- Card -->
    <div style="background:#1e1e2e;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#4c1d95 0%,#312e81 100%);padding:32px;position:relative;overflow:hidden">
        <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:rgba(255,255,255,0.04);border-radius:50%"></div>
        <div style="position:absolute;bottom:-30px;left:20px;width:80px;height:80px;background:rgba(255,255,255,0.03);border-radius:50%"></div>
        <div style="position:relative">
          <div style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);padding:4px 14px;border-radius:20px;margin-bottom:14px">
            <span style="color:#e9d5ff;font-size:12px;font-weight:600">NUEVO TICKET #${ticket.id}</span>
          </div>
          <h1 style="color:white;margin:0 0 8px;font-size:22px;font-weight:700;line-height:1.3">${ticket.title}</h1>
          <p style="color:#c4b5fd;margin:0;font-size:13px">Solicitado por <strong style="color:white">${requestorName}</strong> · ${date}</p>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px">

        <!-- Priority badge -->
        <div style="margin-bottom:24px">
          <div style="display:inline-flex;align-items:center;gap:6px;background:${pc.bg};border:1px solid ${pc.border};color:${pc.color};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600">
            ${priorityEmoji} Prioridad ${priorityLabel}
          </div>
        </div>

        <!-- Description -->
        <div style="background:#16162a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:28px">
          <p style="margin:0 0 8px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Descripción</p>
          <p style="margin:0;color:#d1d5db;font-size:14px;line-height:1.7">${ticket.description}</p>
        </div>

        <!-- CTA Button -->
        <div style="text-align:center">
          <a href="${appUrl}/tickets/${ticket.id}"
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em">
            Ver ticket completo →
          </a>
        </div>

      </div>

      <!-- Footer -->
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding:16px 32px;text-align:center">
        <p style="margin:0;color:#4b5563;font-size:11px">GLD Service Portal · Notificación automática · No responder este correo</p>
      </div>
    </div>

  </div>
</body>
</html>`
}

async function sendEmails(ticket, requestorName, recipients) {
  const toList = recipients.filter(r => r.type === 'email' && r.active).map(r => r.value)
  if (!toList.length) return
  await brevoSend(toList, `[Ticket #${ticket.id}] ${ticket.title}`, buildTicketHtml(ticket, requestorName))
}

async function sendSMS(ticket, requestorName, recipients) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM_NUMBER

  if (!sid || sid.startsWith('ACxxx') || !token || token.startsWith('xxx') || !from || from.startsWith('+1XXX')) {
    console.log('⚠️  SMS: Twilio no configurado.')
    return
  }

  const phoneList = recipients.filter(r => r.type === 'sms' && r.active).map(r => r.value)
  if (!phoneList.length) return

  let client
  try {
    client = require('twilio')(sid, token)
  } catch {
    console.log('⚠️  SMS: No se pudo cargar Twilio.')
    return
  }

  const priorityLabel = PRIORITY_LABELS[ticket.priority] || ticket.priority
  const emoji = PRIORITY_EMOJI[ticket.priority] || '🎫'
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const body = `${emoji} Nuevo Ticket #${ticket.id} [${priorityLabel}]\n${ticket.title}\nSolicitante: ${requestorName}\n${appUrl}/tickets/${ticket.id}`

  for (const phone of phoneList) {
    try {
      await client.messages.create({ body, from, to: phone })
      console.log(`📱 SMS enviado a: ${phone}`)
    } catch (err) {
      console.error(`❌ Error SMS a ${phone}:`, err.message)
    }
  }
}

// ─── Función principal ────────────────────────────────────────────────────────
// Llama esto al crear un ticket nuevo

async function notifyNewTicket(ticket, requestorName) {
  try {
    const setting = await prisma.notificationSetting.findUnique({
      where: { priority: ticket.priority },
    })
    if (!setting) return

    const recipients = await prisma.notificationRecipient.findMany({
      where: { active: true },
    })
    if (!recipients.length) return

    if (setting.emailEnabled) await sendEmails(ticket, requestorName, recipients)
    if (setting.smsEnabled)   await sendSMS(ticket, requestorName, recipients)
  } catch (err) {
    console.error('❌ Error en notifyNewTicket:', err.message)
  }
}

// ─── Email de recuperación (mantiene compatibilidad) ──────────────────────────

async function sendPasswordResetEmail(user, token) {
  if (!process.env.BREVO_API_KEY) { console.log('⚠️  Brevo no configurado.'); return }

  const appUrl    = process.env.APP_URL || 'http://localhost:5173'
  const resetUrl  = `${appUrl}/reset-password?token=${token}`

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:540px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.12)">
    <div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%);padding:28px 32px;text-align:center">
      <div style="font-size:32px;margin-bottom:12px">🔑</div>
      <h1 style="color:white;margin:0;font-size:20px;font-weight:700">Recuperación de Contraseña</h1>
      <p style="color:#c4b5fd;margin:6px 0 0;font-size:13px">GLD Service Portal</p>
    </div>
    <div style="background:white;padding:28px 32px">
      <p style="color:#374151;font-size:15px;margin:0 0 16px">Se solicitó el restablecimiento de contraseña para:</p>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0;color:#5b21b6;font-size:15px;font-weight:600">${user.name}</p>
        <p style="margin:4px 0 0;color:#7c3aed;font-size:13px">${user.email}</p>
      </div>
      <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
        Restablecer contraseña →
      </a>
      <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">Este enlace expira en 1 hora.</p>
    </div>
  </div>
</body></html>`

  await brevoSend(user.email, `[GLD] Recuperación de contraseña — ${user.name}`, html)
  console.log(`🔑 Enlace de recuperación enviado a: ${user.email}`)
}

// ─── Notificaciones directas al creador del ticket ───────────────────────────

const STATUS_LABELS  = { NEW: 'Nuevo', IN_REVIEW: 'En Revisión', IN_PROGRESS: 'En Progreso', IN_TESTING: 'En Pruebas', COMPLETED: 'Completado' }
const STATUS_COLORS  = { NEW: '#64748b', IN_REVIEW: '#d97706', IN_PROGRESS: '#0284c7', IN_TESTING: '#7c3aed', COMPLETED: '#16a34a' }
const STATUS_BG      = { NEW: '#f1f5f9', IN_REVIEW: '#fef3c7', IN_PROGRESS: '#e0f2fe', IN_TESTING: '#ede9fe', COMPLETED: '#dcfce7' }
const FIELD_LABELS   = { status: 'Estado', priority: 'Prioridad', assignee: 'Técnico asignado', title: 'Título', description: 'Descripción', category: 'Categoría', subCategory: 'Sub-categoría' }

function sendToCreator(to, subject, html) {
  brevoSend(to, subject, html)
    .then(() => console.log(`📧 Notif. creador → ${to}`))
    .catch(err => console.error('❌ Error notif. creador:', err.message))
}

function headerHtml(emoji, title, subtitle) {
  return `<div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%);padding:26px 32px;text-align:center">
    <div style="font-size:28px;margin-bottom:10px">${emoji}</div>
    <h1 style="color:white;margin:0;font-size:18px;font-weight:700">${title}</h1>
    <p style="color:#c4b5fd;margin:5px 0 0;font-size:12px">${subtitle}</p>
  </div>`
}

function footerHtml() {
  return `<div style="background:#f8fafc;padding:12px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;color:#94a3b8;font-size:11px">GLD Service Portal — Notificación automática. No responder este correo.</p>
  </div>`
}

function ticketMetaHtml(ticket) {
  const statusLabel = STATUS_LABELS[ticket.status]  || ticket.status
  const statusColor = STATUS_COLORS[ticket.status]  || '#64748b'
  const statusBg    = STATUS_BG[ticket.status]      || '#f1f5f9'
  const prioLabel   = PRIORITY_LABELS[ticket.priority] || ticket.priority
  const prioStyle   = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM
  const appUrl      = process.env.APP_URL || 'http://localhost:5173'

  return `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0"><span style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Ticket</span><br>
            <span style="color:#111827;font-size:13px;font-weight:700">#${ticket.id}</span></td>
          <td style="padding:4px 0"><span style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Estado</span><br>
            <span style="background:${statusBg};color:${statusColor};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${statusLabel}</span></td>
          <td style="padding:4px 0"><span style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Prioridad</span><br>
            <span style="${prioStyle}">${prioLabel}</span></td>
        </tr>
      </table>
    </div>
    <div style="margin-bottom:20px">
      <p style="margin:0 0 5px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Título</p>
      <p style="margin:0;color:#111827;font-size:16px;font-weight:600">${ticket.title}</p>
    </div>
    <a href="${appUrl}/tickets/${ticket.id}"
       style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:11px 24px;border-radius:9px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:4px">
      Ver ticket completo →
    </a>`
}

// 1. Ticket creado → al solicitante
async function notifyTicketCreatedToRequestor(ticket, requestorEmail) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
    ${headerHtml('🎫', 'Tu solicitud fue registrada', 'GLD Service Portal')}
    <div style="background:white;padding:28px 32px">
      <p style="color:#374151;font-size:14px;margin:0 0 20px">Tu ticket fue creado exitosamente. Nuestro equipo lo revisará pronto.</p>
      ${ticketMetaHtml(ticket)}
      ${ticket.description ? `<div style="margin-top:20px;padding-top:20px;border-top:1px solid #f3f4f6">
        <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Descripción</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.65">${ticket.description}</p>
      </div>` : ''}
    </div>
    ${footerHtml()}
  </div></body></html>`

  sendToCreator(requestorEmail, `[Ticket #${ticket.id}] Tu solicitud fue registrada — ${ticket.title}`, html)
}

// 2. Ticket actualizado → al solicitante
async function notifyTicketUpdatedToRequestor(ticket, requestorEmail, changes, changedByName) {
  if (!changes || changes.length === 0) return

  const changeRows = changes.map(c => {
    const fieldLabel = FIELD_LABELS[c.field] || c.field
    const oldVal = c.field === 'status'   ? (STATUS_LABELS[c.oldValue]   || c.oldValue   || '—') :
                   c.field === 'priority' ? (PRIORITY_LABELS[c.oldValue] || c.oldValue   || '—') : (c.oldValue || '—')
    const newVal = c.field === 'status'   ? (STATUS_LABELS[c.newValue]   || c.newValue   || '—') :
                   c.field === 'priority' ? (PRIORITY_LABELS[c.newValue] || c.newValue   || '—') : (c.newValue || '—')
    return `<tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;font-weight:600">${fieldLabel}</td>
      <td style="padding:8px 12px;color:#9ca3af;font-size:13px;border-bottom:1px solid #f3f4f6;text-decoration:line-through">${oldVal}</td>
      <td style="padding:8px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6;font-weight:600">${newVal}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
    ${headerHtml('🔄', 'Tu ticket fue actualizado', 'GLD Service Portal')}
    <div style="background:white;padding:28px 32px">
      <p style="color:#374151;font-size:14px;margin:0 0 20px">
        <strong>${changedByName}</strong> realizó cambios en tu solicitud.
      </p>
      ${ticketMetaHtml(ticket)}
      <div style="margin-top:22px">
        <p style="margin:0 0 10px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Cambios realizados</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;color:#6b7280;font-size:11px;text-align:left;font-weight:700;text-transform:uppercase">Campo</th>
              <th style="padding:8px 12px;color:#6b7280;font-size:11px;text-align:left;font-weight:700;text-transform:uppercase">Antes</th>
              <th style="padding:8px 12px;color:#6b7280;font-size:11px;text-align:left;font-weight:700;text-transform:uppercase">Ahora</th>
            </tr>
          </thead>
          <tbody>${changeRows}</tbody>
        </table>
      </div>
    </div>
    ${footerHtml()}
  </div></body></html>`

  sendToCreator(requestorEmail, `[Ticket #${ticket.id}] Actualización en tu solicitud — ${ticket.title}`, html)
}

// 3. Nuevo comentario → al solicitante
async function notifyCommentToRequestor(ticket, requestorEmail, comment, authorName) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
    ${headerHtml('💬', 'Nuevo comentario en tu ticket', 'GLD Service Portal')}
    <div style="background:white;padding:28px 32px">
      ${ticketMetaHtml(ticket)}
      <div style="margin-top:22px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 10px 10px 0;padding:16px 18px">
        <p style="margin:0 0 8px;color:#7c3aed;font-size:12px;font-weight:700">${authorName} comentó:</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.65">${comment}</p>
      </div>
    </div>
    ${footerHtml()}
  </div></body></html>`

  sendToCreator(requestorEmail, `[Ticket #${ticket.id}] Nuevo comentario — ${ticket.title}`, html)
}

// 4. Nuevo comentario → al técnico asignado
async function notifyCommentToTechnician(ticket, techEmail, comment, authorName) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
    ${headerHtml('💬', 'Nuevo comentario en ticket asignado', 'GLD Service Portal')}
    <div style="background:white;padding:28px 32px">
      <p style="color:#374151;font-size:14px;margin:0 0 20px">Hay un nuevo comentario en un ticket que tienes asignado.</p>
      ${ticketMetaHtml(ticket)}
      <div style="margin-top:22px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 10px 10px 0;padding:16px 18px">
        <p style="margin:0 0 8px;color:#1d4ed8;font-size:12px;font-weight:700">${authorName} comentó:</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.65">${comment}</p>
      </div>
    </div>
    ${footerHtml()}
  </div></body></html>`

  sendToCreator(techEmail, `[Ticket #${ticket.id}] Nuevo comentario — ${ticket.title}`, html)
}

// 5. Ticket asignado → al técnico asignado
async function notifyTicketAssignedToTechnician(ticket, techEmail, assignerName) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1)">
    ${headerHtml('🔧', 'Ticket asignado a ti', 'GLD Service Portal')}
    <div style="background:white;padding:28px 32px">
      <p style="color:#374151;font-size:14px;margin:0 0 20px">
        <strong>${assignerName}</strong> te asignó el siguiente ticket. Por favor revísalo y comienza a trabajar en él.
      </p>
      ${ticketMetaHtml(ticket)}
      ${ticket.description ? `<div style="margin-top:20px;padding-top:20px;border-top:1px solid #f3f4f6">
        <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Descripción</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.65">${ticket.description}</p>
      </div>` : ''}
    </div>
    ${footerHtml()}
  </div></body></html>`

  sendToCreator(techEmail, `[Ticket #${ticket.id}] Ticket asignado a ti — ${ticket.title}`, html)
}

module.exports = {
  notifyNewTicket,
  sendPasswordResetEmail,
  notifyTicketCreatedToRequestor,
  notifyTicketUpdatedToRequestor,
  notifyCommentToRequestor,
  notifyCommentToTechnician,
  notifyTicketAssignedToTechnician,
}
