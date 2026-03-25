const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole } = require('../middleware/auth')

const prisma = new PrismaClient()

// GET /api/workflow — tickets assigned to me (not completed) + all my tasks
router.get('/', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const userId = req.user.id
  try {
    const [tickets, tasks] = await Promise.all([
      prisma.ticket.findMany({
        where: { assigneeId: userId, status: { not: 'COMPLETED' } },
        select: {
          id: true, title: true, priority: true, status: true,
          createdAt: true, updatedAt: true,
          requestor: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      prisma.task.findMany({
        where: { userId },
        include: { checklistItems: { orderBy: { sortOrder: 'asc' } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ])
    res.json({ tickets, tasks })
  } catch (error) {
    console.error('Workflow GET error:', error)
    res.status(500).json({ error: 'Error al obtener datos del workflow' })
  }
})

// POST /api/workflow/tasks
router.post('/tasks', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const { title, description, priority, dueDate, ticketId } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'El título es requerido' })
  try {
    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        ticketId: ticketId ? parseInt(ticketId) : null,
        userId: req.user.id,
      },
    })
    res.status(201).json(task)
  } catch (error) {
    console.error('Task create error:', error)
    res.status(500).json({ error: 'Error al crear tarea' })
  }
})

// PUT /api/workflow/tasks/:id
router.put('/tasks/:id', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const taskId = parseInt(req.params.id)
  const { title, description, status, priority, dueDate, sortOrder } = req.body
  try {
    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'No autorizado' })

    const data = {}
    if (title !== undefined) data.title = title.trim()
    if (description !== undefined) data.description = description?.trim() || null
    if (status !== undefined) {
      data.status = status
      data.completedAt = status === 'DONE' ? new Date() : null
    }
    if (priority !== undefined) data.priority = priority
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder)

    const task = await prisma.task.update({ where: { id: taskId }, data })
    res.json(task)
  } catch (error) {
    console.error('Task update error:', error)
    res.status(500).json({ error: 'Error al actualizar tarea' })
  }
})

// DELETE /api/workflow/tasks/:id
router.delete('/tasks/:id', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const taskId = parseInt(req.params.id)
  try {
    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'No autorizado' })
    await prisma.task.delete({ where: { id: taskId } })
    res.json({ message: 'Tarea eliminada' })
  } catch (error) {
    console.error('Task delete error:', error)
    res.status(500).json({ error: 'Error al eliminar tarea' })
  }
})

// POST /api/workflow/tasks/:id/checklist — add item
router.post('/tasks/:id/checklist', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const taskId = parseInt(req.params.id)
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'El texto es requerido' })
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.userId !== req.user.id) return res.status(403).json({ error: 'No autorizado' })
    const last = await prisma.taskChecklistItem.findFirst({ where: { taskId }, orderBy: { sortOrder: 'desc' } })
    const item = await prisma.taskChecklistItem.create({
      data: { text: text.trim(), taskId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    res.status(201).json(item)
  } catch (error) {
    console.error('Checklist create error:', error)
    res.status(500).json({ error: 'Error al crear ítem' })
  }
})

// PUT /api/workflow/tasks/:id/checklist/:itemId — update item (text or done)
router.put('/tasks/:id/checklist/:itemId', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const itemId = parseInt(req.params.itemId)
  const { text, done } = req.body
  try {
    const item = await prisma.taskChecklistItem.findUnique({
      where: { id: itemId },
      include: { task: { select: { userId: true } } },
    })
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })
    if (item.task.userId !== req.user.id) return res.status(403).json({ error: 'No autorizado' })
    const data = {}
    if (text !== undefined) data.text = text.trim()
    if (done !== undefined) data.done = Boolean(done)
    const updated = await prisma.taskChecklistItem.update({ where: { id: itemId }, data })
    res.json(updated)
  } catch (error) {
    console.error('Checklist update error:', error)
    res.status(500).json({ error: 'Error al actualizar ítem' })
  }
})

// DELETE /api/workflow/tasks/:id/checklist/:itemId
router.delete('/tasks/:id/checklist/:itemId', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const itemId = parseInt(req.params.itemId)
  try {
    const item = await prisma.taskChecklistItem.findUnique({
      where: { id: itemId },
      include: { task: { select: { userId: true } } },
    })
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })
    if (item.task.userId !== req.user.id) return res.status(403).json({ error: 'No autorizado' })
    await prisma.taskChecklistItem.delete({ where: { id: itemId } })
    res.json({ message: 'Ítem eliminado' })
  } catch (error) {
    console.error('Checklist delete error:', error)
    res.status(500).json({ error: 'Error al eliminar ítem' })
  }
})

// PATCH /api/workflow/tickets/:id/status — quick status update
router.patch('/tickets/:id/status', authenticate, requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  const ticketId = parseInt(req.params.id)
  const { status } = req.body
  const valid = ['NEW', 'IN_REVIEW', 'IN_PROGRESS', 'IN_TESTING', 'COMPLETED']
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' })
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
    if (ticket.assigneeId !== req.user.id) return res.status(403).json({ error: 'No autorizado' })

    const [updated] = await Promise.all([
      prisma.ticket.update({
        where: { id: ticketId },
        data: { status },
        select: { id: true, status: true },
      }),
      prisma.history.create({
        data: { ticketId, userId: req.user.id, field: 'status', oldValue: ticket.status, newValue: status },
      }),
    ])
    res.json(updated)
  } catch (error) {
    console.error('Ticket status error:', error)
    res.status(500).json({ error: 'Error al actualizar estado' })
  }
})

module.exports = router