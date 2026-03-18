const router = require('express').Router()
const multer = require('multer')
const { v2: cloudinary } = require('cloudinary')
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')
const { notifyCommentToRequestor, notifyCommentToTechnician } = require('../services/notifications')

const prisma = new PrismaClient()

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
    folder: 'gld-tickets/comments',
    resource_type: file.mimetype.startsWith('image/') ? 'image' : 'raw',
    public_id: `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`,
  }),
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Tipo de archivo no permitido'))
  },
})

// POST /api/tickets/:id/comments
router.post('/:id/comments', authenticate, upload.single('attachment'), async (req, res) => {
  const ticketId = parseInt(req.params.id)
  const { content } = req.body

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío' })
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        requestor: { select: { id: true, email: true } },
        assignee:  { select: { id: true, email: true } },
      },
    })
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })

    if (req.user.role === 'USER' && ticket.requestorId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a este ticket' })
    }

    const attachmentUrl  = req.file ? req.file.path : null
    const attachmentName = req.file ? req.file.originalname : null

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        ticketId,
        userId: req.user.id,
        attachmentUrl,
        attachmentName,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    })

    await prisma.history.create({
      data: {
        ticketId,
        userId: req.user.id,
        field: 'comment',
        oldValue: null,
        newValue: 'Comentario agregado',
      },
    })

    if (ticket.requestorId !== req.user.id && ticket.requestor?.email) {
      notifyCommentToRequestor(ticket, ticket.requestor.email, content.trim(), req.user.name)
    }

    if (ticket.assigneeId && ticket.assigneeId !== req.user.id && ticket.assignee?.email) {
      notifyCommentToTechnician(ticket, ticket.assignee.email, content.trim(), req.user.name)
    }

    res.status(201).json(comment)
  } catch (error) {
    console.error('Comment error:', error)
    res.status(500).json({ error: 'Error al agregar comentario' })
  }
})

// DELETE /api/tickets/:id/comments/:commentId
router.delete('/:id/comments/:commentId', authenticate, async (req, res) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: parseInt(req.params.commentId) },
    })

    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' })

    if (comment.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No puedes eliminar este comentario' })
    }

    await prisma.comment.delete({ where: { id: comment.id } })
    res.json({ message: 'Comentario eliminado' })
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar comentario' })
  }
})

module.exports = router
