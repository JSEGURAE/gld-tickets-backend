const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, name: true, email: true, active: true,
        role: { select: { id: true, name: true, label: true } },
      },
    })

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario no autorizado' })
    }

    // Flatten role so req.user.role is always a string — all requireRole() checks work unchanged
    req.user = { ...user, roleId: user.role.id, roleLabel: user.role.label, role: user.role.name }
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada, inicia sesión nuevamente' })
    }
    return res.status(401).json({ error: 'Token inválido' })
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permisos para esta acción' })
  }
  next()
}

module.exports = { authenticate, requireRole }
