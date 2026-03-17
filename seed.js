require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...\n')

  // ─── Limpiar datos existentes ──────────────────────────────────────────────
  await prisma.ticketSupervisor.deleteMany()
  await prisma.history.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.user.deleteMany()
  await prisma.role.deleteMany()
  await prisma.sede.deleteMany()

  // ─── Crear sedes ───────────────────────────────────────────────────────────
  await Promise.all([
    prisma.sede.create({ data: { nombre: 'Cartago Dr. Max',    serie: 'CART', email: 'optocartago@drmaxsalud.net' } }),
    prisma.sede.create({ data: { nombre: 'San José Dr. Max',   serie: 'SJO',  email: 'optosanjose@drmaxsalud.net' } }),
    prisma.sede.create({ data: { nombre: 'Heredia Dr. Max',    serie: 'HER',  email: 'optoheredia@drmaxsalud.net' } }),
    prisma.sede.create({ data: { nombre: 'Alajuela Dr. Max',   serie: 'ALA',  email: 'optoalajuela@drmaxsalud.net' } }),
  ])
  console.log('✅ Sedes creadas')

  // ─── Crear roles ───────────────────────────────────────────────────────────
  const [roleAdmin, roleTech, roleSupervisor, roleUser] = await Promise.all([
    prisma.role.create({ data: { name: 'ADMIN',      label: 'Administrador', description: 'Control total del sistema y usuarios' } }),
    prisma.role.create({ data: { name: 'TECHNICIAN', label: 'Técnico',       description: 'Gestiona, asigna y resuelve tickets' } }),
    prisma.role.create({ data: { name: 'SUPERVISOR', label: 'Supervisor',    description: 'Puede ver todos los tickets del sistema' } }),
    prisma.role.create({ data: { name: 'USER',       label: 'Usuario',       description: 'Crea y sigue sus propios tickets' } }),
  ])
  console.log('✅ Roles creados:', [roleAdmin, roleTech, roleSupervisor, roleUser].map(r => r.label).join(', '))

  // ─── Crear usuarios ────────────────────────────────────────────────────────
  const hash = pwd => bcrypt.hash(pwd, 10)

  const [admin, carlos, lucia, maria, juan, ana, pedro] = await Promise.all([
    prisma.user.create({ data: { name: 'BI',              email: 'admin@tickets.dev',        password: await hash('Drmax2025+'), roleId: roleAdmin.id } }),
    prisma.user.create({ data: { name: 'Luis Perez',      email: 'luis.perez@tickets.dev',  password: await hash('root1234'), roleId: roleTech.id } }),
    prisma.user.create({ data: { name: 'Lucía Rodríguez', email: 'lucia@tickets.dev',       password: await hash('admin123'), roleId: roleTech.id } }),
    prisma.user.create({ data: { name: 'María Supervisora', email: 'maria@tickets.dev',     password: await hash('admin123'), roleId: roleSupervisor.id } }),
    prisma.user.create({ data: { name: 'Alexa Chacón',    email: 'achacon@tickets.dev',     password: await hash('1234'),     roleId: roleUser.id } }),
    prisma.user.create({ data: { name: 'Ana Martínez',    email: 'ana@tickets.dev',         password: await hash('admin123'), roleId: roleUser.id } }),
    prisma.user.create({ data: { name: 'Pedro López',     email: 'pedro@tickets.dev',       password: await hash('admin123'), roleId: roleUser.id } }),
  ])

  console.log('✅ Usuarios creados:', [admin, carlos, lucia, maria, juan, ana, pedro].map(u => `${u.name} (roleId:${u.roleId})`).join(', '))

  // ─── Crear tickets ─────────────────────────────────────────────────────────
  const ticketsData = [
    {
      title: 'Error crítico en el módulo de facturación',
      description: 'El sistema de facturación muestra un error 500 al intentar generar facturas para clientes con más de 10 líneas de productos. Afecta a todos los usuarios del área contable.',
      priority: 'CRITICAL', status: 'IN_PROGRESS', requestorId: juan.id, assigneeId: carlos.id,
    },
    {
      title: 'El sistema no permite exportar reportes a PDF',
      description: 'Al intentar exportar cualquier reporte a formato PDF, el botón no responde y no hay ningún mensaje de error. El problema aparece en todos los navegadores.',
      priority: 'HIGH', status: 'NEW', requestorId: ana.id, assigneeId: null,
    },
    {
      title: 'Solicitud de equipo de cómputo para nuevo empleado',
      description: 'Se necesita configurar una laptop para el nuevo colaborador del área de ventas que ingresa el próximo lunes. Requiere acceso a los sistemas corporativos.',
      priority: 'MEDIUM', status: 'IN_REVIEW', requestorId: pedro.id, assigneeId: lucia.id,
    },
    {
      title: 'Contraseña de Wi-Fi corporativo actualizada',
      description: 'Se cambió la contraseña del Wi-Fi corporativo del piso 3 y varios empleados no pueden conectarse. Necesitan las nuevas credenciales.',
      priority: 'LOW', status: 'COMPLETED', requestorId: juan.id, assigneeId: carlos.id,
    },
    {
      title: 'Error 500 en el portal de clientes externos',
      description: 'El portal web que usan los clientes externos para ver sus pedidos está mostrando un error 500 desde las 14:00 hrs de hoy. Ya hay múltiples quejas de clientes.',
      priority: 'CRITICAL', status: 'IN_TESTING', requestorId: ana.id, assigneeId: carlos.id,
    },
    {
      title: 'Actualización de permisos de acceso al sistema ERP',
      description: 'El usuario Juan García del área de compras necesita acceso de lectura al módulo de inventarios del ERP para poder realizar sus reportes semanales.',
      priority: 'MEDIUM', status: 'NEW', requestorId: juan.id, assigneeId: null,
    },
    {
      title: 'El correo corporativo no envía archivos adjuntos grandes',
      description: 'Al intentar enviar correos con adjuntos mayores a 5MB el sistema da un error de timeout. El límite debería ser de 25MB según la política de la empresa.',
      priority: 'HIGH', status: 'IN_PROGRESS', requestorId: pedro.id, assigneeId: lucia.id,
    },
    {
      title: 'Configurar impresora del piso 2 oficina sur',
      description: 'La impresora HP LaserJet del piso 2 no aparece en la lista de impresoras de las computadoras nuevas. Se necesita instalar los drivers y configurar la red.',
      priority: 'LOW', status: 'COMPLETED', requestorId: ana.id, assigneeId: lucia.id,
    },
    {
      title: 'Falla en el servidor de respaldos nocturnos',
      description: 'Los respaldos automáticos nocturnos han fallado los últimos 3 días. El log muestra errores de conexión con el servidor de almacenamiento NAS.',
      priority: 'HIGH', status: 'IN_REVIEW', requestorId: pedro.id, assigneeId: carlos.id,
    },
    {
      title: 'Solicitud de licencia de software Adobe Creative Cloud',
      description: 'El departamento de marketing necesita 3 licencias adicionales de Adobe Creative Cloud para el equipo de diseño gráfico que se incorpora este mes.',
      priority: 'MEDIUM', status: 'NEW', requestorId: juan.id, assigneeId: null,
    },
    {
      title: 'Acceso denegado al sistema contable para usuario nuevo',
      description: 'La nueva contadora María Fernández no puede acceder al sistema SAP. Al intentar iniciar sesión recibe el mensaje "Usuario no autorizado" aunque ya fue dado de alta.',
      priority: 'HIGH', status: 'IN_PROGRESS', requestorId: ana.id, assigneeId: carlos.id,
    },
    {
      title: 'Error en el módulo de generación de reportes financieros',
      description: 'El módulo de reportes financieros no calcula correctamente los totales cuando hay transacciones en moneda extranjera. Afecta los reportes del cierre del mes.',
      priority: 'MEDIUM', status: 'IN_TESTING', requestorId: pedro.id, assigneeId: lucia.id,
    },
    {
      title: 'Instalación de antivirus en equipos del área de ventas',
      description: 'Se requiere instalar y configurar el antivirus corporativo en los 8 equipos nuevos del área de ventas. Incluye configuración de políticas de seguridad.',
      priority: 'MEDIUM', status: 'COMPLETED', requestorId: juan.id, assigneeId: lucia.id,
    },
    {
      title: 'VPN corporativa no conecta desde trabajo remoto',
      description: 'Varios empleados reportan que la VPN corporativa no permite la conexión desde sus hogares después de la actualización del servidor del viernes pasado.',
      priority: 'HIGH', status: 'NEW', requestorId: ana.id, assigneeId: null,
    },
    {
      title: 'Capacitación en uso de herramientas de colaboración Microsoft 365',
      description: 'Se requiere organizar una sesión de capacitación para el personal administrativo sobre el uso de Microsoft Teams, SharePoint y OneDrive.',
      priority: 'LOW', status: 'IN_REVIEW', requestorId: pedro.id, assigneeId: lucia.id,
    },
  ]

  const tickets = await Promise.all(ticketsData.map(data => prisma.ticket.create({ data })))
  console.log(`✅ ${tickets.length} tickets creados`)

  // ─── Crear comentarios e historial ────────────────────────────────────────
  await prisma.comment.createMany({
    data: [
      { ticketId: tickets[0].id, userId: carlos.id, content: 'Revisando el módulo de facturación. Parece ser un problema con la consulta SQL al generar ítems múltiples.' },
      { ticketId: tickets[0].id, userId: juan.id, content: 'Gracias Carlos, ¿tienes estimado de cuándo podría estar resuelto? Es urgente para el cierre de mes.' },
      { ticketId: tickets[0].id, userId: carlos.id, content: 'Estimo resolverlo hoy antes de las 18:00. Ya identifiqué el problema en el procedimiento almacenado.' },
      { ticketId: tickets[2].id, userId: lucia.id, content: 'Revisando inventario de equipos disponibles. Confirmo disponibilidad para el lunes.' },
      { ticketId: tickets[4].id, userId: carlos.id, content: 'Identificado: error en la configuración del servidor de caché. Aplicando corrección.' },
      { ticketId: tickets[4].id, userId: admin.id, content: 'Escalado a prioridad crítica. Favor mantener informado al equipo.' },
      { ticketId: tickets[6].id, userId: lucia.id, content: 'El problema es la configuración del servidor de correo Exchange. Incrementando el límite de tamaño.' },
      { ticketId: tickets[8].id, userId: carlos.id, content: 'Encontré el problema: el certificado SSL del servidor NAS expiró. Renovando certificado.' },
      { ticketId: tickets[10].id, userId: carlos.id, content: 'Creando usuario en Active Directory y asignando permisos en SAP. Proceso toma ~2 horas.' },
      { ticketId: tickets[11].id, userId: lucia.id, content: 'Identificado el bug en el cálculo de tipo de cambio. Probando el fix en ambiente de desarrollo.' },
    ],
  })

  await prisma.history.createMany({
    data: [
      { ticketId: tickets[0].id, userId: carlos.id, field: 'status', oldValue: 'NEW', newValue: 'IN_PROGRESS' },
      { ticketId: tickets[0].id, userId: admin.id, field: 'assignee', oldValue: 'Sin asignar', newValue: carlos.id.toString() },
      { ticketId: tickets[2].id, userId: admin.id, field: 'status', oldValue: 'NEW', newValue: 'IN_REVIEW' },
      { ticketId: tickets[2].id, userId: admin.id, field: 'assignee', oldValue: 'Sin asignar', newValue: lucia.id.toString() },
      { ticketId: tickets[3].id, userId: carlos.id, field: 'status', oldValue: 'IN_PROGRESS', newValue: 'COMPLETED' },
      { ticketId: tickets[4].id, userId: carlos.id, field: 'status', oldValue: 'IN_PROGRESS', newValue: 'IN_TESTING' },
      { ticketId: tickets[4].id, userId: admin.id, field: 'priority', oldValue: 'HIGH', newValue: 'CRITICAL' },
      { ticketId: tickets[7].id, userId: lucia.id, field: 'status', oldValue: 'NEW', newValue: 'COMPLETED' },
      { ticketId: tickets[8].id, userId: admin.id, field: 'status', oldValue: 'NEW', newValue: 'IN_REVIEW' },
      { ticketId: tickets[11].id, userId: lucia.id, field: 'status', oldValue: 'IN_PROGRESS', newValue: 'IN_TESTING' },
      { ticketId: tickets[12].id, userId: lucia.id, field: 'status', oldValue: 'IN_PROGRESS', newValue: 'COMPLETED' },
    ],
  })

  console.log('✅ Comentarios e historial creados')

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎉 Base de datos lista! Credenciales de acceso:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('👤 Admin:     admin@tickets.dev   / Drmax2025+')
  console.log('🔧 Técnico:   carlos@tickets.dev  / admin123')
  console.log('🔧 Técnica:   lucia@tickets.dev   / admin123')
  console.log('👥 Usuario:   achacon@tickets.dev    / 1234')
  console.log('👥 Usuario:   ana@tickets.dev     / admin123')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch(e => { console.error('❌ Error en seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
