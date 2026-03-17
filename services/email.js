const nodemailer = require('nodemailer')

const PRIORITY_LABELS = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' }
const PRIORITY_STYLES = {
  LOW:      'background:#e2e8f0;color:#475569;padding:2px 10px;border-radius:20px;font-size:13px',
  MEDIUM:   'background:#cffafe;color:#0e7490;padding:2px 10px;border-radius:20px;font-size:13px',
  HIGH:     'background:#ffedd5;color:#c2410c;padding:2px 10px;border-radius:20px;font-size:13px',
  CRITICAL: 'background:#ffe4e6;color:#be123c;padding:2px 10px;border-radius:20px;font-size:13px;font-weight:700',
}

function createTransporter() {
  // If no SMTP configured, log warning and skip
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || process.env.SMTP_PASS === 'TU_CONTRASENA_AQUI') {
    return null
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  })
}

function buildHtml(ticket, requestorName) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const priorityStyle = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM
  const priorityLabel = PRIORITY_LABELS[ticket.priority] || ticket.priority

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:580px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.12)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%);padding:28px 32px;text-align:center">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:14px;margin-bottom:14px;font-size:24px">🎫</div>
      <h1 style="color:white;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em">Nuevo Ticket de Soporte</h1>
      <p style="color:#c4b5fd;margin:6px 0 0;font-size:13px;font-weight:500">GLD Service Portal</p>
    </div>

    <!-- Body -->
    <div style="background:white;padding:28px 32px">
      <div style="display:inline-block;background:#ede9fe;color:#7c3aed;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:22px;letter-spacing:0.02em">
        #${ticket.id}
      </div>

      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f3f4f6">
        <p style="margin:0 0 5px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Título</p>
        <p style="margin:0;color:#111827;font-size:17px;font-weight:600;line-height:1.4">${ticket.title}</p>
      </div>

      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f3f4f6">
        <p style="margin:0 0 5px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Descripción</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.65">${ticket.description}</p>
      </div>

      <div style="display:flex;gap:24px;margin-bottom:26px">
        <div style="flex:1">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Prioridad</p>
          <span style="${priorityStyle}">${priorityLabel}</span>
        </div>
        <div style="flex:1">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Solicitante</p>
          <p style="margin:0;color:#374151;font-size:14px;font-weight:600">${requestorName}</p>
        </div>
        <div style="flex:1">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Fecha</p>
          <p style="margin:0;color:#374151;font-size:14px">${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>

      <a href="${appUrl}/tickets/${ticket.id}"
         style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.01em">
        Ver Ticket →
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:11px">GLD Service Portal — Notificación automática del sistema</p>
    </div>
  </div>
</body>
</html>`
}

async function sendNewTicketNotification(ticket, requestorName) {
  const transporter = createTransporter()
  if (!transporter) {
    console.log('⚠️  Email: SMTP no configurado. Configura SMTP_HOST, SMTP_USER y SMTP_PASS en server/.env')
    return
  }

  const toEmails = (process.env.NOTIFY_EMAILS || 'luis.perez@drmaxsalud.net,jsegura@drmaxsalud.net')
    .split(',').map(e => e.trim()).filter(Boolean)

  try {
    await transporter.sendMail({
      from: `"GLD Service Portal" <${process.env.SMTP_USER}>`,
      to: toEmails.join(', '),
      subject: `[Ticket #${ticket.id}] ${ticket.title}`,
      html: buildHtml(ticket, requestorName),
    })
    console.log(`📧 Notificación enviada a: ${toEmails.join(', ')}`)
  } catch (err) {
    console.error('❌ Error enviando email:', err.message)
  }
}

async function sendPasswordResetEmail(user, token) {
  const transporter = createTransporter()
  if (!transporter) {
    console.log('⚠️  Email: SMTP no configurado. No se pudo enviar el correo de recuperación.')
    return
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const resetUrl = `${appUrl}/reset-password?token=${token}`
  const adminEmail = 'jsegura@drmaxsalud.net'

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:540px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.12)">
    <div style="background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%);padding:28px 32px;text-align:center">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:14px;margin-bottom:14px;font-size:24px">🔑</div>
      <h1 style="color:white;margin:0;font-size:20px;font-weight:700">Recuperación de Contraseña</h1>
      <p style="color:#c4b5fd;margin:6px 0 0;font-size:13px;font-weight:500">GLD Service Portal</p>
    </div>
    <div style="background:white;padding:28px 32px">
      <p style="color:#374151;font-size:15px;margin:0 0 16px">Se solicitó el restablecimiento de contraseña para la cuenta:</p>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0;color:#5b21b6;font-size:15px;font-weight:600">${user.name}</p>
        <p style="margin:4px 0 0;color:#7c3aed;font-size:13px">${user.email}</p>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px">Haz clic en el botón para crear una nueva contraseña. Este enlace expira en <strong>1 hora</strong>.</p>
      <a href="${resetUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
        Restablecer contraseña →
      </a>
      <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">Si no solicitaste este cambio, puedes ignorar este correo.</p>
    </div>
    <div style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:11px">GLD Service Portal — Notificación automática del sistema</p>
    </div>
  </div>
</body>
</html>`

  try {
    await transporter.sendMail({
      from: `"GLD Service Portal" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `[GLD] Recuperación de contraseña — ${user.name}`,
      html,
    })
    console.log(`🔑 Enlace de recuperación enviado a: ${adminEmail}`)
  } catch (err) {
    console.error('❌ Error enviando email de recuperación:', err.message)
  }
}

module.exports = { sendNewTicketNotification, sendPasswordResetEmail }
