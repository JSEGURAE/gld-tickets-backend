const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole } = require('../middleware/auth')

const prisma = new PrismaClient()

// Helper: flatten user.role relation to role name string
const userSelect = {
  id: true, name: true, email: true, active: true, createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true, label: true } },
  sedeId: true,
  sede: { select: { id: true, nombre: true, serie: true } },
  _count: { select: { requestedTickets: true, assignedTickets: true } },
}
const flatUser = (u) => ({ ...u, role: u.role.name, roleLabel: u.role.label })

// GET /api/users
router.get('/', authenticate, requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } })
    res.json(users.map(flatUser))
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// GET /api/users/technicians
router.get('/technicians', authenticate, async (req, res) => {
  try {
    const technicians = await prisma.user.findMany({
      where: { role: { name: { in: ['TECHNICIAN', 'ADMIN'] } }, active: true },
      select: { id: true, name: true, email: true, role: { select: { name: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(technicians.map(u => ({ ...u, role: u.role.name })))
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener técnicos' })
  }
})

// GET /api/users/supervisors
router.get('/supervisors', authenticate, async (req, res) => {
  try {
    const supervisors = await prisma.user.findMany({
      where: { role: { name: 'SUPERVISOR' }, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
    res.json(supervisors)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener supervisores' })
  }
})

// GET /api/users/:id
router.get('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: userSelect,
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(flatUser(user))
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario' })
  }
})

// POST /api/users
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  const { name, email, password, roleId } = req.body

  if (!name || !email || !password || !roleId) {
    return res.status(400).json({ error: 'Nombre, email, contraseña y rol son requeridos' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  try {
    const roleExists = await prisma.role.findUnique({ where: { id: parseInt(roleId) } })
    if (!roleExists) return res.status(400).json({ error: 'Rol inválido' })

    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' })

    const hashed = await bcrypt.hash(password, 10)
    const emailClean = email.toLowerCase().trim()

    // Auto-asignar sede si existe una con el mismo email
    const sede = await prisma.sede.findUnique({ where: { email: emailClean } })

    const user = await prisma.user.create({
      data: {
        name: name.trim(), email: emailClean, password: hashed,
        roleId: parseInt(roleId),
        sedeId: sede?.id || null,
      },
      select: userSelect,
    })
    res.status(201).json(flatUser(user))
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Error al crear usuario' })
  }
})

// PUT /api/users/:id
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const userId = parseInt(req.params.id)
  const { name, email, roleId, sedeId, active, password } = req.body

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: { select: { name: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' })

    // Prevent removing the last admin
    if (roleId) {
      const newRole = await prisma.role.findUnique({ where: { id: parseInt(roleId) } })
      if (newRole && newRole.name !== 'ADMIN' && existing.role.name === 'ADMIN') {
        const adminCount = await prisma.user.count({ where: { role: { name: 'ADMIN' }, active: true } })
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'No puedes degradar al último administrador' })
        }
      }
    }

    const updateData = {}
    if (name) updateData.name = name.trim()
    if (email) updateData.email = email.toLowerCase().trim()
    if (roleId) updateData.roleId = parseInt(roleId)
    if (sedeId !== undefined) updateData.sedeId = sedeId ? parseInt(sedeId) : null
    if (active !== undefined) updateData.active = Boolean(active)
    if (password && password.length >= 6) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: userSelect,
    })
    res.json(flatUser(user))
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    res.status(500).json({ error: 'Error al actualizar usuario' })
  }
})

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const userId = parseInt(req.params.id)

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { _count: { select: { requestedTickets: true } } },
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (user._count.requestedTickets > 0) {
      return res.status(400).json({
        error: `Este usuario tiene ${user._count.requestedTickets} ticket(s). Desactiva la cuenta en su lugar para conservar el historial.`,
      })
    }

    await prisma.comment.deleteMany({ where: { userId } })
    await prisma.history.deleteMany({ where: { userId } })
    await prisma.ticket.updateMany({ where: { assigneeId: userId }, data: { assigneeId: null } })
    await prisma.user.delete({ where: { id: userId } })

    res.json({ message: 'Usuario eliminado permanentemente' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Error al eliminar usuario' })
  }
})

module.exports = router
