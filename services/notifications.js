const { PrismaClient } = require('@prisma/client')
const nodemailer = require('nodemailer')

const prisma = new PrismaClient()

const PRIORITY_LABELS = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' }
const PRIORITY_EMOJI  = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }
const PRIORITY_STYLES = {
  LOW:      'background:#e2e8f0;color:#475569;padding:2px 10px;border-radius:20px;font-size:13px',
  MEDIUM:   'background:#cffafe;color:#0e7490;padding:2px 10px;border-radius:20px;font-size:13px',
  HIGH:     'background:#ffedd5;color:#c2410c;padding:2px 10px;border-radius:20px;font-size:13px',
  CRITICAL: 'background:#ffe4e6;color:#be123c;padding:2px 10px;border-radius:20px;font-size:13px;font-weight:700',
}

// ─── Brevo SMTP ───────────────────────────────────────────────────────────────

function getTransporter() {
  if (!process.env.BREVO_API_KEY) return null
  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_API_KEY,
    },
  })
}

const FROM_EMAIL = `GLD Service Portal <${process.env.BREVO_SMTP_USER || 'noreply@gld.com'}>`

function buildTicketHtml(ticket, requestorName) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const priorityStyle = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM
  const priorityLabel = PRIORITY_LABELS[ticket.priority] || ticket.priority

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.12)">
    <div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%);padding:28px 32px;text-align:center">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:14px;margin-bottom:14px;font-size:24px">🎫</div>
      <h1 style="color:white;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em">Nuevo Ticket de Soporte</h1>
      <p style="color:#c4b5fd;margin:6px 0 0;font-size:13px;font-weight:500">GLD Service Portal</p>
    </div>
    <div style="background:white;padding:28px 32px">
      <div style="display:inline-block;background:#ede9fe;color:#7c3aed;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:22px">#${ticket.id}</div>
      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f3f4f6">
        <p style="margin:0 0 5px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Título</p>
        <p style="margin:0;color:#111827;font-size:17px;font-weight:600">${ticket.title}</p>
      </div>
      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f3f4f6">
        <p style="margin:0 0 5px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Descripción</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.65">${ticket.description}</p>
      </div>
      <div style="display:flex;gap:24px;margin-bottom:26px">
        <div style="flex:1">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Prioridad</p>
          <span style="${priorityStyle}">${priorityLabel}</span>
        </div>
        <div style="flex:1">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Solicitante</p>
          <p style="margin:0;color:#374151;font-size:14px;font-weight:600">${requestorName}</p>
        </div>
        <div style="flex:1">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase">Fecha</p>
          <p style="margin:0;color:#374151;font-size:14px">${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>
      <a href="${appUrl}/tickets/${ticket.id}"
         style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
        Ver Ticket →
      </a>
    </div>
    <div style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:11px">GLD Service Portal — Notificación automática del sistema</p>
    </div>
  </div>
</body>
</html>`
}

async function sendEmails(ticket, requestorName, recipients) {
  const transporter = getTransporter()
  if (!transporter) { console.log('⚠️  Brevo no configurado.'); return }

  const toList = recipients.filter(r => r.type === 'email' && r.active).map(r => r.value)
  if (!toList.length) return

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: toList.join(', '),
      subject: `[Ticket #${ticket.id}] ${ticket.title}`,
      html: buildTicketHtml(ticket, requestorName),
    })
    console.log(`📧 Email enviado a: ${toList.join(', ')}`)
  } catch (err) {
    console.error('❌ Error enviando email:', err.message)
  }
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
  const transporter = getTransporter()
  if (!transporter) { console.log('⚠️  Brevo no configurado.'); return }

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

  try {
    await transporter.sendMail({ from: FROM_EMAIL, to: user.email, subject: `[GLD] Recuperación de contraseña — ${user.name}`, html })
    console.log(`🔑 Enlace de recuperación enviado a: ${user.email}`)
  } catch (err) {
    console.error('❌ Error enviando email de recuperación:', err.message)
  }
}

// ─── Notificaciones directas al creador del ticket ───────────────────────────

const STATUS_LABELS  = { NEW: 'Nuevo', IN_REVIEW: 'En Revisión', IN_PROGRESS: 'En Progreso', IN_TESTING: 'En Pruebas', COMPLETED: 'Completado' }
const STATUS_COLORS  = { NEW: '#64748b', IN_REVIEW: '#d97706', IN_PROGRESS: '#0284c7', IN_TESTING: '#7c3aed', COMPLETED: '#16a34a' }
const STATUS_BG      = { NEW: '#f1f5f9', IN_REVIEW: '#fef3c7', IN_PROGRESS: '#e0f2fe', IN_TESTING: '#ede9fe', COMPLETED: '#dcfce7' }
const FIELD_LABELS   = { status: 'Estado', priority: 'Prioridad', assignee: 'Técnico asignado', title: 'Título', description: 'Descripción', category: 'Categoría', subCategory: 'Sub-categoría' }

function sendToCreator(to, subject, html) {
  const transporter = getTransporter()
  if (!transporter) return
  transporter.sendMail({ from: FROM_EMAIL, to, subject, html })
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
