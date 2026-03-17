const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../utils/email')

const prisma = new PrismaClient()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' })
  }

  try {
    // Support login by email OR by exact name
    const roleInclude = { role: { select: { id: true, name: true, label: true } } }
    let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: roleInclude })
    if (!user) {
      user = await prisma.user.findFirst({ where: { name: email }, include: roleInclude })
    }

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }

    const roleName = user.role.name
    const token = jwt.sign(
      { id: user.id, email: user.email, role: roleName },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: roleName,
        roleLabel: user.role.label,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Error al iniciar sesión' })
  }
})

// POST /api/auth/register — public self-registration (role USER)
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña son requeridos' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  try {
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (exists) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' })

    const userRole = await prisma.role.findUnique({ where: { name: 'USER' } })
    if (!userRole) return res.status(500).json({ error: 'Configuración de roles no encontrada' })

    const hashed = await bcrypt.hash(password, 10)
    const emailClean = email.toLowerCase().trim()

    // Auto-assign sede if a sede's email matches the registering user's email
    const sede = await prisma.sede.findUnique({ where: { email: emailClean } })

    const user = await prisma.user.create({
      data: { name: name.trim(), email: emailClean, password: hashed, roleId: userRole.id, sedeId: sede?.id || null },
      select: { id: true, name: true, email: true, role: { select: { name: true, label: true } } },
    })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    res.status(201).json({ user: { ...user, role: user.role.name, roleLabel: user.role.label }, token })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Error al crear la cuenta' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user })
})

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' })
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const match = await bcrypt.compare(currentPassword, user.password)

    if (!match) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' })
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } })

    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (error) {
    res.status(500).json({ error: 'Error al cambiar la contraseña' })
  }
})

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'El usuario es requerido' })

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    // Always respond OK to avoid user enumeration
    if (!user || !user.active) {
      return res.json({ message: 'Si el usuario existe, se enviará un enlace de recuperación.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    })

    await sendPasswordResetEmail(user, token)

    res.json({ message: 'Si el usuario existe, se enviará un enlace de recuperación.' })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Error al procesar la solicitud' })
  }
})

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token y contraseña son requeridos' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    })

    if (!user) {
      return res.status(400).json({ error: 'El enlace no es válido o ha expirado' })
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    })

    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Error al restablecer la contraseña' })
  }
})

module.exports = router
