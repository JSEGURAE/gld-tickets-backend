require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')

// ─── Routes ────────────────────────────────────────────────────────────────────
const authRoutes          = require('./routes/auth')
const ticketRoutes        = require('./routes/tickets')
const userRoutes          = require('./routes/users')
const commentRoutes       = require('./routes/comments')
const categoryRoutes      = require('./routes/categories')
const statsRoutes         = require('./routes/stats')
const notificationRoutes  = require('./routes/notifications')
const roleRoutes          = require('./routes/roles')
const sedeRoutes          = require('./routes/sedes')

const app = express()
const PORT = process.env.PORT || 3001

// ─── Middleware ────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.APP_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes)
app.use('/api/tickets',    ticketRoutes)
app.use('/api/tickets',    commentRoutes)
app.use('/api/users',      userRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/stats',         statsRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/roles',         roleRoutes)
app.use('/api/sedes',         sedeRoutes)

// ─── Static files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ─── Frontend (production) ────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../Frontend/dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/dist/index.html'))
  })
}

// ─── Error handlers ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Error interno del servidor' })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor DEV Tickets en http://localhost:${PORT}`)
  console.log(`📊 API: http://localhost:${PORT}/api`)
  console.log(`🗄️  Entorno: ${process.env.NODE_ENV || 'development'}\n`)
})
