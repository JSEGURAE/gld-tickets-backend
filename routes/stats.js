const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')

const prisma = new PrismaClient()

// GET /api/stats
router.get('/', authenticate, async (req, res) => {
  try {
    const where = req.user.role === 'USER' ? { requestorId: req.user.id } : {}

    const [total, byStatus, byPriority, recent] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.groupBy({ by: ['status'], where, _count: { id: true } }),
      prisma.ticket.groupBy({ by: ['priority'], where, _count: { id: true } }),
      prisma.ticket.findMany({
        where,
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: {
          requestor: { select: { id: true, name: true } },
          assignee:  { select: { id: true, name: true } },
        },
      }),
    ])

    const statusMap = {}
    byStatus.forEach(s => { statusMap[s.status] = s._count.id })

    const priorityMap = {}
    byPriority.forEach(p => { priorityMap[p.priority] = p._count.id })

    res.json({ total, byStatus: statusMap, byPriority: priorityMap, recentTickets: recent })
  } catch (error) {
    console.error('Stats error:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})

// GET /api/stats/monthly — tickets creados por mes
// Query params: from=YYYY-MM-DD, to=YYYY-MM-DD
router.get('/monthly', authenticate, async (req, res) => {
  try {
    const where = req.user.role === 'USER' ? { requestorId: req.user.id } : {}

    // Resolve display range (used for buckets only)
    const fromStr = req.query.from || (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 11); return d.toISOString().slice(0, 10)
    })()
    const toStr = req.query.to || new Date().toISOString().slice(0, 10)

    // Parse as local dates (YYYY-MM-DD → year/month/day)
    const [fy, fm, fd] = fromStr.split('-').map(Number)
    const [ty, tm, td] = toStr.split('-').map(Number)
    const dateFrom = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
    const dateTo   = new Date(ty, tm - 1, td, 23, 59, 59, 999)

    // Fetch all tickets for user (no date filter to avoid TiDB DateTime issues)
    const tickets = await prisma.ticket.findMany({
      where,
      select: { createdAt: true },
    })

    // Build month buckets for the selected range
    const months = {}
    const cursor = new Date(fy, fm - 1, 1)
    const end    = new Date(ty, tm - 1, 1)
    while (cursor <= end) {
      const key   = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const label = cursor.toLocaleDateString('es-CR', { month: 'short', year: '2-digit' })
      months[key] = { mes: label, total: 0 }
      cursor.setMonth(cursor.getMonth() + 1)
    }

    // Group tickets by month — filter by range in JS
    tickets.forEach(t => {
      const d = new Date(t.createdAt)
      if (d < dateFrom || d > dateTo) return
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (months[key] !== undefined) months[key].total++
    })

    res.json(Object.values(months))
  } catch (error) {
    console.error('Monthly stats error:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas mensuales' })
  }
})

module.exports = router
