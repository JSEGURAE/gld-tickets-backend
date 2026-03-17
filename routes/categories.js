const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole } = require('../middleware/auth')

const prisma = new PrismaClient()

// ─── GET /api/categories ──────────────────────────────────────────────────────
// Public for auth users — returns active categories with their active subcategories
router.get('/', authenticate, async (req, res) => {
  try {
    const all = req.query.all === 'true' // admin can request all including inactive
    const isAdmin = req.user.role === 'ADMIN'

    const categories = await prisma.category.findMany({
      where: all && isAdmin ? {} : { active: true },
      include: {
        subcategories: {
          where: all && isAdmin ? {} : { active: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { tickets: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json(categories)
  } catch (error) {
    console.error('Get categories error:', error)
    res.status(500).json({ error: 'Error al obtener categorías' })
  }
})

// ─── POST /api/categories ─────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

  try {
    const exists = await prisma.category.findUnique({ where: { name: name.trim() } })
    if (exists) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' })

    const category = await prisma.category.create({
      data: { name: name.trim() },
      include: { subcategories: true, _count: { select: { tickets: true } } },
    })
    res.status(201).json(category)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear categoría' })
  }
})

// ─── PUT /api/categories/:id ──────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const catId = parseInt(req.params.id)
  const { name, active } = req.body

  try {
    const existing = await prisma.category.findUnique({ where: { id: catId } })
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' })

    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (active !== undefined) data.active = Boolean(active)

    const category = await prisma.category.update({
      where: { id: catId },
      data,
      include: { subcategories: { orderBy: { name: 'asc' } }, _count: { select: { tickets: true } } },
    })
    res.json(category)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' })
    res.status(500).json({ error: 'Error al actualizar categoría' })
  }
})

// ─── DELETE /api/categories/:id ───────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const catId = parseInt(req.params.id)
  try {
    const cat = await prisma.category.findUnique({
      where: { id: catId },
      include: { _count: { select: { tickets: true } } },
    })
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' })
    if (cat._count.tickets > 0) {
      return res.status(400).json({ error: `No se puede eliminar: hay ${cat._count.tickets} ticket(s) usando esta categoría. Desactívala en su lugar.` })
    }

    await prisma.category.delete({ where: { id: catId } })
    res.json({ message: 'Categoría eliminada' })
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar categoría' })
  }
})

// ─── POST /api/categories/:id/subcategories ───────────────────────────────────
router.post('/:id/subcategories', authenticate, requireRole('ADMIN'), async (req, res) => {
  const categoryId = parseInt(req.params.id)
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

  try {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' })

    const sub = await prisma.subCategory.create({
      data: { name: name.trim(), categoryId },
    })
    res.status(201).json(sub)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe esa subcategoría en esta categoría' })
    res.status(500).json({ error: 'Error al crear subcategoría' })
  }
})

// ─── PUT /api/subcategories/:id ───────────────────────────────────────────────
router.put('/subcategories/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const subId = parseInt(req.params.id)
  const { name, active } = req.body

  try {
    const existing = await prisma.subCategory.findUnique({ where: { id: subId } })
    if (!existing) return res.status(404).json({ error: 'Subcategoría no encontrada' })

    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (active !== undefined) data.active = Boolean(active)

    const sub = await prisma.subCategory.update({ where: { id: subId }, data })
    res.json(sub)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe esa subcategoría en esta categoría' })
    res.status(500).json({ error: 'Error al actualizar subcategoría' })
  }
})

// ─── DELETE /api/subcategories/:id ────────────────────────────────────────────
router.delete('/subcategories/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  const subId = parseInt(req.params.id)
  try {
    const sub = await prisma.subCategory.findUnique({
      where: { id: subId },
      include: { _count: { select: { tickets: true } } },
    })
    if (!sub) return res.status(404).json({ error: 'Subcategoría no encontrada' })
    if (sub._count.tickets > 0) {
      return res.status(400).json({ error: `No se puede eliminar: hay ${sub._count.tickets} ticket(s) usando esta subcategoría.` })
    }

    await prisma.subCategory.delete({ where: { id: subId } })
    res.json({ message: 'Subcategoría eliminada' })
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar subcategoría' })
  }
})

module.exports = router
