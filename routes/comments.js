const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')
const { notifyCommentToRequestor, notifyCommentToTechnician } = require('../services/notifications')

const prisma = new PrismaClient()

// POST /api/tickets/:id/comments
router.post('/:id/comments', authenticate, async (req, res) => {
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

    // Users can only comment on their own tickets
    if (req.user.role === 'USER' && ticket.requestorId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a este ticket' })
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        ticketId,
        userId: req.user.id,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    })

    // Log in history
    await prisma.history.create({
      data: {
        ticketId,
        userId: req.user.id,
        field: 'comment',
        oldValue: null,
        newValue: 'Comentario agregado',
      },
    })

    // Notificar al creador si el comentario lo hace otra persona
    if (ticket.requestorId !== req.user.id && ticket.requestor?.email) {
      notifyCommentToRequestor(ticket, ticket.requestor.email, content.trim(), req.user.name)
    }

    // Notificar al técnico asignado si el comentario lo hace alguien distinto
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

    // Only the author or admin can delete
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
