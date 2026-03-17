const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')

const prisma = new PrismaClient()

// GET /api/roles — lista todos los roles (autenticado)
router.get('/', authenticate, async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { users: true } } },
    })
    res.json(roles)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener roles' })
  }
})

module.exports = router
