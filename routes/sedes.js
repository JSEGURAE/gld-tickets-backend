const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole } = require('../middleware/auth')

const prisma = new PrismaClient()

// GET /api/sedes
router.get('/', authenticate, async (req, res) => {
  try {
    const all = req.query.all === 'true' && req.user.role === 'ADMIN'
    const sedes = await prisma.sede.findMany({
      where: all ? {} : { active: true },
      include: { _count: { select: { users: true } } },
      orderBy: { nombre: 'asc' },
    })
    res.json(sedes)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener sedes' })
  }
})

// POST /api/sedes
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  const { nombre, serie, email } = req.body
  if (!nombre?.trim() || !serie?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nombre, serie y correo son requeridos' })
  }
  try {
    const exists = await prisma.sede.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (exists) return res.status(409).json({ error: 'Ya existe una sede con ese correo' })

    const sede = await prisma.sede.create({
      data: { nombre: nombre.trim(), serie: serie.trim().toUpperCase(), email: email.toLowerCase().trim() },
      include: { _count: { select: { users: true } } },
    })

    // Auto-asignar a usuario que tenga el mismo email
    await prisma.user.updateMany({
      where: { email: email.toLowerCase().trim() },
      data: { sedeId: sede.id },
    })

    res.status(201).json(sede)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear sede' })
  }
})

// PUT /api/sedes/:id
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const sedeId = parseInt(req.params.id)
  const { nombre, serie, email, active } = req.body
  try {
    const existing = await prisma.sede.findUnique({ where: { id: sedeId } })
    if (!existing) return res.status(404).json({ error: 'Sede no encontrada' })

    const data = {}
    if (nombre?.trim()) data.nombre = nombre.trim()
    if (serie?.trim()) data.serie = serie.trim().toUpperCase()
    if (email?.trim()) data.email = email.toLowerCase().trim()
    if (active !== undefined) data.active = Boolean(active)

    const sede = await prisma.sede.update({
      where: { id: sedeId },
      data,
      include: { _count: { select: { users: true } } },
    })
    res.json(sede)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe una sede con ese correo' })
    res.status(500).json({ error: 'Error al actualizar sede' })
  }
})

// DELETE /api/sedes/:id
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const sedeId = parseInt(req.params.id)
  try {
    const sede = await prisma.sede.findUnique({
      where: { id: sedeId },
      include: { _count: { select: { users: true } } },
    })
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' })
    if (sede._count.users > 0) {
      return res.status(400).json({ error: `No se puede eliminar: hay ${sede._count.users} usuario(s) asignados. Desactívala en su lugar.` })
    }
    await prisma.sede.delete({ where: { id: sedeId } })
    res.json({ message: 'Sede eliminada' })
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar sede' })
  }
})

module.exports = router
