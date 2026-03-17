const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole } = require('../middleware/auth')

const prisma = new PrismaClient()

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

// ─── GET /api/notifications/settings ─────────────────────────────────────────
// Devuelve configuración por prioridad (crea defaults si no existen)
router.get('/settings', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    // Asegurar que existan los 4 registros (uno por prioridad)
    for (const priority of PRIORITIES) {
      await prisma.notificationSetting.upsert({
        where: { priority },
        update: {},
        create: { priority, emailEnabled: false, smsEnabled: false },
      })
    }

    const settings = await prisma.notificationSetting.findMany({
      orderBy: { id: 'asc' },
    })
    res.json(settings)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener configuración' })
  }
})

// ─── PUT /api/notifications/settings/:priority ────────────────────────────────
router.put('/settings/:priority', authenticate, requireRole('ADMIN'), async (req, res) => {
  const { priority } = req.params
  if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Prioridad inválida' })

  const { emailEnabled, smsEnabled } = req.body

  try {
    const setting = await prisma.notificationSetting.upsert({
      where: { priority },
      update: {
        ...(emailEnabled !== undefined && { emailEnabled: Boolean(emailEnabled) }),
        ...(smsEnabled   !== undefined && { smsEnabled:   Boolean(smsEnabled)   }),
      },
      create: {
        priority,
        emailEnabled: Boolean(emailEnabled ?? false),
        smsEnabled:   Boolean(smsEnabled   ?? false),
      },
    })
    res.json(setting)
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuración' })
  }
})

// ─── GET /api/notifications/recipients ───────────────────────────────────────
router.get('/recipients', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const recipients = await prisma.notificationRecipient.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    })
    res.json(recipients)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener destinatarios' })
  }
})

// ─── POST /api/notifications/recipients ──────────────────────────────────────
router.post('/recipients', authenticate, requireRole('ADMIN'), async (req, res) => {
  const { type, value, name } = req.body
  if (!type || !['email', 'sms'].includes(type)) return res.status(400).json({ error: 'Tipo inválido (email | sms)' })
  if (!value?.trim()) return res.status(400).json({ error: 'El valor es requerido' })

  try {
    const recipient = await prisma.notificationRecipient.create({
      data: { type, value: value.trim(), name: (name || '').trim() },
    })
    res.status(201).json(recipient)
  } catch (err) {
    res.status(500).json({ error: 'Error al crear destinatario' })
  }
})

// ─── PUT /api/notifications/recipients/:id ────────────────────────────────────
router.put('/recipients/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id)
  const { name, value, active } = req.body

  try {
    const existing = await prisma.notificationRecipient.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Destinatario no encontrado' })

    const data = {}
    if (name  !== undefined) data.name  = name.trim()
    if (value !== undefined) data.value = value.trim()
    if (active !== undefined) data.active = Boolean(active)

    const recipient = await prisma.notificationRecipient.update({ where: { id }, data })
    res.json(recipient)
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar destinatario' })
  }
})

// ─── DELETE /api/notifications/recipients/:id ────────────────────────────────
router.delete('/recipients/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id)
  try {
    const existing = await prisma.notificationRecipient.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Destinatario no encontrado' })

    await prisma.notificationRecipient.delete({ where: { id } })
    res.json({ message: 'Destinatario eliminado' })
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar destinatario' })
  }
})

module.exports = router
