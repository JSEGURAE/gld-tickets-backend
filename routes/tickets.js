const router = require('express').Router()
const multer = require('multer')
const { v2: cloudinary } = require('cloudinary')
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole } = require('../middleware/auth')
const { notifyNewTicket, notifyTicketCreatedToRequestor, notifyTicketUpdatedToRequestor, notifyTicketAssignedToTechnician } = require('../services/notifications')
const { notifyTechnicians } = require('./push')

const prisma = new PrismaClient()

// ─── Cloudinary config ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const ALLOWED_MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'gld-tickets',
    resource_type: file.mimetype.startsWith('image/') ? 'image' : 'raw',
    public_id: `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`,
  }),
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Tipo de archivo no permitido. Use imágenes, PDF, Excel o Word.'))
  },
})

// ─── Constants ─────────────────────────────────────────────────────────────────
const VALID_STATUSES = ['NEW', 'IN_REVIEW', 'IN_PROGRESS', 'IN_TESTING', 'COMPLETED']
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

// Base include used on list queries
const ticketInclude = {
  requestor:   { select: { id: true, name: true, email: true } },
  assignee:    { select: { id: true, name: true, email: true } },
  supervisors: { include: { supervisor: { select: { id: true, name: true, email: true } } } },
  _count:      { select: { comments: true } },
}

// Full include for detail view
const ticketDetailInclude = {
  ...ticketInclude,
  category:    { select: { id: true, name: true } },
  subCategory: { select: { id: true, name: true } },
}

const CAN_SEE_ALL = ['TECHNICIAN', 'ADMIN', 'SUPERVISOR']

// ─── GET /api/tickets ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      status, priority, search, assigneeId,
      page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = req.query

    const where = {}
    if (!CAN_SEE_ALL.includes(req.user.role)) where.requestorId = req.user.id
    if (status && VALID_STATUSES.includes(status)) where.status = status
    if (priority && VALID_PRIORITIES.includes(priority)) where.priority = priority
    if (assigneeId) where.assigneeId = parseInt(assigneeId)
    if (search) {
      const numericId = parseInt(search.replace('#', ''))
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        ...(isNaN(numericId) ? [] : [{ id: numericId }]),
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({ where, include: ticketInclude, orderBy: { [sortBy]: sortOrder }, skip, take }),
      prisma.ticket.count({ where }),
    ])

    res.json({ tickets, pagination: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) } })
  } catch (error) {
    console.error('Get tickets error:', error)
    res.status(500).json({ error: 'Error al obtener tickets' })
  }
})

// ─── GET /api/tickets/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Try full include (with category/subCategory). Falls back if migration not yet run.
    let includeWithCats
    try {
      includeWithCats = {
        ...ticketDetailInclude,
        comments: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      }
    } catch (_) {
      includeWithCats = {
        ...ticketInclude,
        comments: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      }
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(req.params.id) },
      include: includeWithCats,
    }).catch(async () => {
      // If category fields fail (migration not run), retry without them
      return prisma.ticket.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          ...ticketInclude,
          comments: {
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'asc' },
          },
          history: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
    })

    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
    if (!CAN_SEE_ALL.includes(req.user.role) && ticket.requestorId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a este ticket' })
    }

    res.json(ticket)
  } catch (error) {
    console.error('Get ticket error:', error)
    res.status(500).json({ error: 'Error al obtener el ticket' })
  }
})

// ─── POST /api/tickets ────────────────────────────────────────────────────────
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  const { title, description, priority = 'MEDIUM' } = req.body

  if (!title || !description) {
    return res.status(400).json({ error: 'Título y descripción son requeridos' })
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Prioridad inválida' })
  }

  try {
    const attachmentUrl  = req.file ? req.file.path : null      // Cloudinary URL
    const attachmentName = req.file ? req.file.originalname : null

    const ticket = await prisma.ticket.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        priority,
        status: 'NEW',
        requestorId: req.user.id,
        attachmentUrl,
        attachmentName,
      },
      include: ticketInclude,
    })

    await prisma.history.create({
      data: { ticketId: ticket.id, userId: req.user.id, field: 'created', oldValue: null, newValue: 'Ticket creado' },
    })

    // Notificaciones: admin-recipients + creador + push
    notifyNewTicket(ticket, req.user.name)
    notifyTicketCreatedToRequestor(ticket, req.user.email)
    notifyTechnicians({
      title: `🎫 Nuevo Ticket #${ticket.id}`,
      body: `${ticket.title} — ${req.user.name}`,
      url: `/tickets/${ticket.id}`,
    })

    res.status(201).json(ticket)
  } catch (error) {
    console.error('Create ticket error:', error)
    res.status(500).json({ error: 'Error al crear el ticket' })
  }
})

// ─── PUT /api/tickets/:id ──────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  const ticketId = parseInt(req.params.id)
  const { title, description, priority, status, assigneeId, categoryId, subCategoryId } = req.body

  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { requestor: { select: { email: true, name: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado' })

    const isOwner = existing.requestorId === req.user.id
    const isTechOrAdmin = ['TECHNICIAN', 'ADMIN'].includes(req.user.role)

    if (!isOwner && !isTechOrAdmin) {
      return res.status(403).json({ error: 'No tienes permisos para editar este ticket' })
    }
    if ((status || assigneeId !== undefined) && !isTechOrAdmin) {
      return res.status(403).json({ error: 'Solo técnicos pueden cambiar estado o asignado' })
    }

    const updateData = {}
    const historyEntries = []

    if (title && title !== existing.title) {
      updateData.title = title.trim()
      historyEntries.push({ field: 'title', oldValue: existing.title, newValue: title.trim() })
    }
    if (description && description !== existing.description) {
      updateData.description = description.trim()
      historyEntries.push({ field: 'description', oldValue: 'Descripción anterior', newValue: 'Descripción actualizada' })
    }
    if (priority && priority !== existing.priority && VALID_PRIORITIES.includes(priority)) {
      updateData.priority = priority
      historyEntries.push({ field: 'priority', oldValue: existing.priority, newValue: priority })
    }
    if (status && status !== existing.status && VALID_STATUSES.includes(status)) {
      updateData.status = status
      historyEntries.push({ field: 'status', oldValue: existing.status, newValue: status })

      // Auto-assign to whoever changes the status (TECH/ADMIN)
      if (isTechOrAdmin && existing.assigneeId !== req.user.id) {
        updateData.assigneeId = req.user.id
        historyEntries.push({
          field: 'assignee',
          oldValue: existing.assigneeId?.toString() ?? null,
          newValue: req.user.id.toString(),
        })
      }
    }
    if (assigneeId !== undefined) {
      const newAssigneeId = assigneeId === null ? null : parseInt(assigneeId)
      if (newAssigneeId !== existing.assigneeId) {
        updateData.assigneeId = newAssigneeId
        historyEntries.push({
          field: 'assignee',
          oldValue: existing.assigneeId?.toString() ?? 'Sin asignar',
          newValue: newAssigneeId?.toString() ?? 'Sin asignar',
        })
      }
    }
    // Category / SubCategory (TECH/ADMIN only)
    if (isTechOrAdmin && categoryId !== undefined) {
      const newCatId = categoryId === null ? null : parseInt(categoryId)
      if (newCatId !== existing.categoryId) {
        updateData.categoryId = newCatId
        updateData.subCategoryId = null // reset subcategory when category changes
        historyEntries.push({ field: 'category', oldValue: existing.categoryId?.toString() ?? null, newValue: newCatId?.toString() ?? null })
      }
    }
    if (isTechOrAdmin && subCategoryId !== undefined) {
      const newSubId = subCategoryId === null ? null : parseInt(subCategoryId)
      if (newSubId !== existing.subCategoryId) {
        updateData.subCategoryId = newSubId
        historyEntries.push({ field: 'subCategory', oldValue: existing.subCategoryId?.toString() ?? null, newValue: newSubId?.toString() ?? null })
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay cambios para guardar' })
    }

    const [updated] = await prisma.$transaction([
      prisma.ticket.update({ where: { id: ticketId }, data: updateData, include: ticketInclude }),
      ...historyEntries.map(entry =>
        prisma.history.create({ data: { ticketId, userId: req.user.id, ...entry } })
      ),
    ])

    // Notificar al creador si los cambios los hizo otra persona
    if (existing.requestorId !== req.user.id && existing.requestor?.email) {
      notifyTicketUpdatedToRequestor(updated, existing.requestor.email, historyEntries, req.user.name)
    }

    // Notificar al técnico si le acaban de asignar el ticket
    if (updateData.assigneeId && updateData.assigneeId !== req.user.id && updated.assignee?.email) {
      notifyTicketAssignedToTechnician(updated, updated.assignee.email, req.user.name)
    }

    res.json(updated)
  } catch (error) {
    console.error('Update ticket error:', error)
    res.status(500).json({ error: 'Error al actualizar el ticket' })
  }
})

// ─── POST /api/tickets/:id/supervisors ────────────────────────────────────────
// Cualquier usuario autenticado puede etiquetar un supervisor en su ticket
router.post('/:id/supervisors', authenticate, async (req, res) => {
  const ticketId = parseInt(req.params.id)
  const { supervisorId } = req.body
  if (!supervisorId) return res.status(400).json({ error: 'supervisorId es requerido' })

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })

    // Only the requestor or tech/admin can tag supervisors
    const canTag = ticket.requestorId === req.user.id || ['TECHNICIAN', 'ADMIN'].includes(req.user.role)
    if (!canTag) return res.status(403).json({ error: 'No tienes permiso para etiquetar supervisores' })

    const supervisor = await prisma.user.findUnique({ where: { id: parseInt(supervisorId) } })
    if (!supervisor || supervisor.role !== 'SUPERVISOR') {
      return res.status(400).json({ error: 'El usuario no existe o no es Supervisor' })
    }

    await prisma.ticketSupervisor.upsert({
      where: { ticketId_supervisorId: { ticketId, supervisorId: parseInt(supervisorId) } },
      update: {},
      create: { ticketId, supervisorId: parseInt(supervisorId) },
    })

    await prisma.history.create({
      data: { ticketId, userId: req.user.id, field: 'supervisor', oldValue: null, newValue: supervisor.name },
    })

    res.status(201).json({ message: 'Supervisor etiquetado' })
  } catch (error) {
    console.error('Tag supervisor error:', error)
    res.status(500).json({ error: 'Error al etiquetar supervisor' })
  }
})

// ─── DELETE /api/tickets/:id/supervisors/:supervisorId ────────────────────────
router.delete('/:id/supervisors/:supervisorId', authenticate, async (req, res) => {
  const ticketId = parseInt(req.params.id)
  const supervisorId = parseInt(req.params.supervisorId)

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })

    const canTag = ticket.requestorId === req.user.id || ['TECHNICIAN', 'ADMIN'].includes(req.user.role)
    if (!canTag) return res.status(403).json({ error: 'No tienes permiso' })

    await prisma.ticketSupervisor.delete({
      where: { ticketId_supervisorId: { ticketId, supervisorId } },
    }).catch(() => {}) // ignore if not found

    res.json({ message: 'Supervisor removido' })
  } catch (error) {
    res.status(500).json({ error: 'Error al remover supervisor' })
  }
})

// ─── DELETE /api/tickets/:id ───────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id)
    const existing = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado' })

    // Delete attachment from Cloudinary if exists
    if (existing.attachmentUrl && existing.attachmentUrl.includes('cloudinary')) {
      const publicId = existing.attachmentUrl.split('/').slice(-2).join('/').split('.')[0]
      cloudinary.uploader.destroy(publicId).catch(() => {})
    }

    await prisma.ticket.delete({ where: { id: ticketId } })
    res.json({ message: 'Ticket eliminado correctamente' })
  } catch (error) {
    console.error('Delete ticket error:', error)
    res.status(500).json({ error: 'Error al eliminar el ticket' })
  }
})

module.exports = router
