const { PrismaClient } = require('@prisma/client')
const https = require('https')

const prisma = new PrismaClient()

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABELS = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' }
const PRIORITY_EMOJI  = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }
const STATUS_LABELS   = { NEW: 'Nuevo', IN_REVIEW: 'En Revisión', IN_PROGRESS: 'En Progreso', IN_TESTING: 'En Pruebas', COMPLETED: 'Completado' }
const STATUS_COLORS   = { NEW: '#64748b', IN_REVIEW: '#d97706', IN_PROGRESS: '#0284c7', IN_TESTING: '#7c3aed', COMPLETED: '#16a34a' }
const STATUS_BG       = { NEW: '#f1f5f9', IN_REVIEW: '#fef3c7', IN_PROGRESS: '#e0f2fe', IN_TESTING: '#ede9fe', COMPLETED: '#dcfce7' }
const FIELD_LABELS    = { status: 'Estado', priority: 'Prioridad', assignee: 'Técnico asignado', title: 'Título', description: 'Descripción', category: 'Categoría', subCategory: 'Sub-categoría' }

const PRIORITY_STYLES = {
  LOW:      'background:#e2e8f0;color:#475569;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600',
  MEDIUM:   'background:#cffafe;color:#0e7490;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600',
  HIGH:     'background:#ffedd5;color:#c2410c;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600',
  CRITICAL: 'background:#ffe4e6;color:#be123c;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700',
}

const AVATAR_COLORS = [
  '#7c3aed','#0891b2','#059669','#d97706',
  '#dc2626','#db2777','#2563eb','#0d9488',
]

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || '?'
}

function getAvatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function avatarHtml(name, size = 48) {
  const color = getAvatarColor(name)
  const initials = getInitials(name)
  const fontSize = size < 40 ? 13 : 18
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:inline-block;text-align:center;line-height:${size}px;color:#fff;font-size:${fontSize}px;font-weight:700;font-family:Arial,sans-serif;vertical-align:middle;flex-shrink:0">${initials}</div>`
}

// ─── Brevo API ────────────────────────────────────────────────────────────────

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

// ─── Shared layout helpers ────────────────────────────────────────────────────

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px">

    <!-- Brand -->
    <div style="text-align:center;margin-bottom:20px">
      <span style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:8px 20px;border-radius:30px;color:white;font-size:12px;font-weight:700;letter-spacing:0.06em">GLD SERVICE PORTAL</span>
    </div>

    <!-- Card -->
    <div style="background:#1a1a2e;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
      ${content}
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:20px">
      <p style="margin:0;color:#374151;font-size:11px">GLD Service Portal · Notificación automática del sistema</p>
    </div>

  </div>
</body>
</html>`
}

function cardHeader(badgeText, title, personName) {
  return `
  <div style="background:linear-gradient(135deg,#4c1d95 0%,#312e81 100%);padding:28px 32px">
    <div style="margin-bottom:16px">
      <span style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);padding:3px 12px;border-radius:20px;color:#e9d5ff;font-size:11px;font-weight:600;letter-spacing:0.05em">${badgeText}</span>
    </div>
    <h1 style="color:white;margin:0 0 16px;font-size:20px;font-weight:700;line-height:1.3">${title}</h1>
    ${personName ? `
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:10px">${avatarHtml(personName, 36)}</td>
      <td style="vertical-align:middle"><span style="color:#c4b5fd;font-size:13px">${personName}</span></td>
    </tr></table>` : ''}
  </div>`
}

function ticketMetaBlock(ticket) {
  const statusLabel = STATUS_LABELS[ticket.status] || ticket.status
  const statusColor = STATUS_COLORS[ticket.status] || '#64748b'
  const statusBg    = STATUS_BG[ticket.status]     || '#f1f5f9'
  const prioLabel   = PRIORITY_LABELS[ticket.priority] || ticket.priority
  const prioStyle   = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM
  const appUrl      = process.env.APP_URL || 'http://localhost:5173'

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#12122a;border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:20px">
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px">Ticket</span>
        <span style="color:#a78bfa;font-size:14px;font-weight:700;font-family:monospace">#${ticket.id}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px">Estado</span>
        <span style="background:${statusBg};color:${statusColor};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${statusLabel}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px">Prioridad</span>
        <span style="${prioStyle}">${prioLabel}</span>
      </td>
    </tr>
    <tr>
      <td colspan="3" style="padding:14px 16px">
        <span style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px">Título</span>
        <span style="color:#e2e8f0;font-size:15px;font-weight:600">${ticket.title}</span>
      </td>
    </tr>
  </table>
  <div style="text-align:center;margin-bottom:8px">
    <a href="${appUrl}/tickets/${ticket.id}"
       style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">
      Ver ticket completo →
    </a>
  </div>`
}

function commentBlock(authorName, comment, accentColor, bgColor) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:${bgColor};border-left:4px solid ${accentColor};border-radius:0 10px 10px 0">
    <tr>
      <td style="padding:14px 16px 6px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:8px;vertical-align:middle">${avatarHtml(authorName, 32)}</td>
          <td style="vertical-align:middle"><span style="color:${accentColor};font-size:12px;font-weight:700">${authorName} comentó:</span></td>
        </tr></table>
      </td>
    </tr>
    <tr><td style="padding:6px 16px 14px;color:#d1d5db;font-size:14px;line-height:1.65">${comment}</td></tr>
  </table>`
}

// ─── notifyNewTicket (admin recipients) ──────────────────────────────────────

function buildTicketHtml(ticket, requestorName) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const priorityLabel = PRIORITY_LABELS[ticket.priority] || ticket.priority
  const priorityEmoji = PRIORITY_EMOJI[ticket.priority] || '🎫'
  const pc = {
    LOW:      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    MEDIUM:   { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    HIGH:     { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    CRITICAL: { bg: '#fff1f2', color: '#be123c', border: '#fecdd3' },
  }[ticket.priority] || { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }

  const date = new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })

  return emailWrapper(`
    ${cardHeader(`NUEVO TICKET #${ticket.id}`, ticket.title, null)}

    <div style="padding:24px 32px">

      <!-- Solicitante -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px"><tr>
        <td style="padding-right:12px;vertical-align:middle">${avatarHtml(requestorName, 44)}</td>
        <td style="vertical-align:middle">
          <span style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block">Solicitante</span>
          <span style="color:#e2e8f0;font-size:15px;font-weight:600">${requestorName}</span>
          <span style="color:#6b7280;font-size:12px;display:block;margin-top:2px">${date}</span>
        </td>
      </tr></table>

      <!-- Priority badge -->
      <div style="margin-bottom:20px">
        <span style="display:inline-block;background:${pc.bg};border:1px solid ${pc.border};color:${pc.color};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600">
          ${priorityEmoji} Prioridad ${priorityLabel}
        </span>
      </div>

      <!-- Description -->
      <div style="background:#12122a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Descripción</p>
        <p style="margin:0;color:#d1d5db;font-size:14px;line-height:1.7">${ticket.description}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center">
        <a href="${appUrl}/tickets/${ticket.id}"
           style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:13px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px">
          Ver ticket completo →
        </a>
      </div>

    </div>
  `)
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

  if (!sid || sid.startsWith('ACxxx') || !token || !from) {
    console.log('⚠️  SMS: Twilio no configurado.')
    return
  }

  const phoneList = recipients.filter(r => r.type === 'sms' && r.active).map(r => r.value)
  if (!phoneList.length) return

  let client
  try { client = require('twilio')(sid, token) } catch { console.log('⚠️  SMS: No se pudo cargar Twilio.'); return }

  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const emoji = PRIORITY_EMOJI[ticket.priority] || '🎫'
  const body = `${emoji} Nuevo Ticket #${ticket.id} [${PRIORITY_LABELS[ticket.priority] || ticket.priority}]\n${ticket.title}\nSolicitante: ${requestorName}\n${appUrl}/tickets/${ticket.id}`

  for (const phone of phoneList) {
    try {
      await client.messages.create({ body, from, to: phone })
      console.log(`📱 SMS enviado a: ${phone}`)
    } catch (err) {
      console.error(`❌ Error SMS a ${phone}:`, err.message)
    }
  }
}

async function notifyNewTicket(ticket, requestorName) {
  try {
    const setting = await prisma.notificationSetting.findUnique({ where: { priority: ticket.priority } })
    if (!setting) return
    const recipients = await prisma.notificationRecipient.findMany({ where: { active: true } })
    if (!recipients.length) return
    if (setting.emailEnabled) await sendEmails(ticket, requestorName, recipients)
    if (setting.smsEnabled)   await sendSMS(ticket, requestorName, recipients)
  } catch (err) {
    console.error('❌ Error en notifyNewTicket:', err.message)
  }
}

// ─── Password reset ───────────────────────────────────────────────────────────

async function sendPasswordResetEmail(user, token) {
  if (!process.env.BREVO_API_KEY) { console.log('⚠️  Brevo no configurado.'); return }
  const appUrl   = process.env.APP_URL || 'http://localhost:5173'
  const resetUrl = `${appUrl}/reset-password?token=${token}`

  const html = emailWrapper(`
    <div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%);padding:28px 32px;text-align:center">
      <div style="font-size:36px;margin-bottom:12px">🔑</div>
      <h1 style="color:white;margin:0;font-size:20px;font-weight:700">Recuperación de Contraseña</h1>
      <p style="color:#c4b5fd;margin:6px 0 0;font-size:13px">GLD Service Portal</p>
    </div>
    <div style="padding:28px 32px">
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px"><tr>
        <td style="padding-right:12px;vertical-align:middle">${avatarHtml(user.name, 44)}</td>
        <td style="vertical-align:middle">
          <span style="color:#e2e8f0;font-size:15px;font-weight:600;display:block">${user.name}</span>
          <span style="color:#6b7280;font-size:13px">${user.email}</span>
        </td>
      </tr></table>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px">Se solicitó el restablecimiento de contraseña para tu cuenta. Haz clic en el botón para continuar.</p>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">
          Restablecer contraseña →
        </a>
      </div>
      <p style="color:#4b5563;font-size:12px;text-align:center;margin:0">Este enlace expira en 1 hora.</p>
    </div>
  `)

  await brevoSend(user.email, `[GLD] Recuperación de contraseña — ${user.name}`, html)
  console.log(`🔑 Enlace de recuperación enviado a: ${user.email}`)
}

// ─── Direct creator/technician notifications ──────────────────────────────────

function sendToCreator(to, subject, html) {
  brevoSend(to, subject, html)
    .then(() => console.log(`📧 Notif. creador → ${to}`))
    .catch(err => console.error('❌ Error notif. creador:', err.message))
}

// 1. Ticket creado → solicitante
async function notifyTicketCreatedToRequestor(ticket, requestorEmail) {
  const requestorName = ticket.requestor?.name || 'Usuario'
  const html = emailWrapper(`
    ${cardHeader(`TICKET #${ticket.id} — RECIBIDO`, 'Tu solicitud fue registrada', requestorName)}
    <div style="padding:24px 32px">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 20px">Tu ticket fue creado exitosamente. Nuestro equipo técnico lo revisará pronto.</p>
      ${ticketMetaBlock(ticket)}
      ${ticket.description ? `
      <div style="background:#12122a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-top:16px">
        <p style="margin:0 0 8px;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Descripción</p>
        <p style="margin:0;color:#d1d5db;font-size:14px;line-height:1.7">${ticket.description}</p>
      </div>` : ''}
    </div>
  `)
  sendToCreator(requestorEmail, `[Ticket #${ticket.id}] Tu solicitud fue registrada — ${ticket.title}`, html)
}

// 2. Ticket actualizado → solicitante
async function notifyTicketUpdatedToRequestor(ticket, requestorEmail, changes, changedByName) {
  if (!changes || changes.length === 0) return

  const changeRows = changes.map(c => {
    const fieldLabel = FIELD_LABELS[c.field] || c.field
    const oldVal = c.field === 'status'   ? (STATUS_LABELS[c.oldValue]   || c.oldValue   || '—') :
                   c.field === 'priority' ? (PRIORITY_LABELS[c.oldValue] || c.oldValue   || '—') : (c.oldValue || '—')
    const newVal = c.field === 'status'   ? (STATUS_LABELS[c.newValue]   || c.newValue   || '—') :
                   c.field === 'priority' ? (PRIORITY_LABELS[c.newValue] || c.newValue   || '—') : (c.newValue || '—')
    return `<tr>
      <td style="padding:9px 12px;color:#9ca3af;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600">${fieldLabel}</td>
      <td style="padding:9px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);text-decoration:line-through">${oldVal}</td>
      <td style="padding:9px 12px;color:#e2e8f0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600">${newVal}</td>
    </tr>`
  }).join('')

  const html = emailWrapper(`
    ${cardHeader(`TICKET #${ticket.id} — ACTUALIZADO`, 'Tu ticket fue actualizado', changedByName)}
    <div style="padding:24px 32px">
      ${ticketMetaBlock(ticket)}
      <div style="margin-top:20px">
        <p style="margin:0 0 10px;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Cambios realizados</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#12122a;border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden">
          <thead>
            <tr style="background:rgba(255,255,255,0.04)">
              <th style="padding:9px 12px;color:#6b7280;font-size:10px;text-align:left;font-weight:700;text-transform:uppercase">Campo</th>
              <th style="padding:9px 12px;color:#6b7280;font-size:10px;text-align:left;font-weight:700;text-transform:uppercase">Antes</th>
              <th style="padding:9px 12px;color:#6b7280;font-size:10px;text-align:left;font-weight:700;text-transform:uppercase">Ahora</th>
            </tr>
          </thead>
          <tbody>${changeRows}</tbody>
        </table>
      </div>
    </div>
  `)
  sendToCreator(requestorEmail, `[Ticket #${ticket.id}] Actualización en tu solicitud — ${ticket.title}`, html)
}

// 3. Nuevo comentario → solicitante
async function notifyCommentToRequestor(ticket, requestorEmail, comment, authorName) {
  const html = emailWrapper(`
    ${cardHeader(`TICKET #${ticket.id} — COMENTARIO`, 'Nuevo comentario en tu ticket', null)}
    <div style="padding:24px 32px">
      ${ticketMetaBlock(ticket)}
      ${commentBlock(authorName, comment, '#7c3aed', 'rgba(124,58,237,0.1)')}
    </div>
  `)
  sendToCreator(requestorEmail, `[Ticket #${ticket.id}] Nuevo comentario — ${ticket.title}`, html)
}

// 4. Nuevo comentario → técnico asignado
async function notifyCommentToTechnician(ticket, techEmail, comment, authorName) {
  const html = emailWrapper(`
    ${cardHeader(`TICKET #${ticket.id} — COMENTARIO`, 'Nuevo comentario en ticket asignado', null)}
    <div style="padding:24px 32px">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 20px">Hay un nuevo comentario en un ticket que tienes asignado.</p>
      ${ticketMetaBlock(ticket)}
      ${commentBlock(authorName, comment, '#3b82f6', 'rgba(59,130,246,0.1)')}
    </div>
  `)
  sendToCreator(techEmail, `[Ticket #${ticket.id}] Nuevo comentario — ${ticket.title}`, html)
}

// 5. Ticket asignado → técnico
async function notifyTicketAssignedToTechnician(ticket, techEmail, assignerName) {
  const html = emailWrapper(`
    ${cardHeader(`TICKET #${ticket.id} — ASIGNADO`, 'Se te asignó un ticket', assignerName)}
    <div style="padding:24px 32px">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 20px">
        <strong style="color:#e2e8f0">${assignerName}</strong> te asignó el siguiente ticket. Por favor revísalo y comienza a trabajar en él.
      </p>
      ${ticketMetaBlock(ticket)}
      ${ticket.description ? `
      <div style="background:#12122a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-top:16px">
        <p style="margin:0 0 8px;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Descripción</p>
        <p style="margin:0;color:#d1d5db;font-size:14px;line-height:1.7">${ticket.description}</p>
      </div>` : ''}
    </div>
  `)
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
