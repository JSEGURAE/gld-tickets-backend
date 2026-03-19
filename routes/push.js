const router = require('express').Router()
const webpush = require('web-push')
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')

const prisma = new PrismaClient()

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

// GET /api/push/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

// POST /api/push/subscribe
router.post('/subscribe', authenticate, async (req, res) => {
  const { endpoint, keys } = req.body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' })
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: req.user.id, endpoint: endpoint.substring(0, 255) } },
      update: { p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('Push subscribe error:', err.message)
    res.status(500).json({ error: 'Error al guardar suscripción' })
  }
})

// POST /api/push/unsubscribe
router.post('/unsubscribe', authenticate, async (req, res) => {
  const { endpoint } = req.body
  try {
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.user.id, endpoint },
    })
    res.json({ ok: true })
  } catch {
    res.json({ ok: true })
  }
})

// Función para notificar a todos los técnicos y admins
async function notifyTechnicians(payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return

  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { user: { role: { in: ['TECHNICIAN', 'ADMIN'] } } },
    })

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        ).catch(async (err) => {
          if (err.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          }
        })
      )
    )
    console.log(`🔔 Push enviado a ${subs.length} técnico(s)`)
  } catch (err) {
    console.error('❌ Error enviando push:', err.message)
  }
}

module.exports = { router, notifyTechnicians }
