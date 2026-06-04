<div align="center">

# 🍽️ LogosPOS (FOOD) — Plataforma SaaS Multi-Tenant de Punto de Venta

**Sistema de Punto de Venta inteligente, modular y adaptable para restaurantes, bares, food trucks, tiendas y más.**

[![Angular](https://img.shields.io/badge/Angular-19-DD0031?style=for-the-badge&logo=angular)](https://angular.io/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Privado-red?style=for-the-badge)](./LICENSE)

🌐 **Producción:** [food.logospos.com](https://food.logospos.com)

</div>

---

## 📋 Descripción

**LogosPOS (FOOD)** es una plataforma SaaS de Punto de Venta construida con **Angular 19** y **Supabase**. Diseñada para operar como un sistema **Multi-Tenant**, permite gestionar múltiples negocios de forma completamente aislada bajo una misma infraestructura.

El sistema es completamente **modular** y se adapta visual y funcionalmente según el tipo de negocio configurado. Un solo despliegue en Vercel sirve como POS completo para un **Restaurante**, un **Bar**, una **Cafetería**, un **Food Truck**, una **Tienda** o un **Billar**, activando únicamente los módulos que cada cliente necesita.

---

## ✨ Características Principales

### 🏢 Arquitectura Multi-Tenant (SaaS)
- Aislamiento total de datos por negocio mediante **RLS (Row Level Security)** en PostgreSQL
- JWT firmado server-side vía **Supabase Edge Function** — nunca expone credenciales al cliente
- Panel de administración global exclusivo para el desarrollador
- Gestión de licencias, planes y suscripciones por tenant

### 🔑 Sistema de Licencias
- Estados: `activa`, `suspendida`, `vencida`
- Planes: `básico`, `profesional`, `pro`, `perpetual`
- Bloqueo automático al vencer la suscripción
- Alertas de renovación (7 días antes del vencimiento)

### 🎛️ Módulos Dinámicos por Tipo de Negocio

| Módulo | General | Tienda | Bar | Billar | Restaurante | Food Truck |
|--------|:-------:|:------:|:---:|:------:|:-----------:|:----------:|
| Ventas / POS | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Inventario General | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Caja Registradora | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mesas | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Restaurante (Mapa, Órdenes, Menú) | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Cocina (KDS) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Inventario Restaurante | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Fiscal (DGII) | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Cuentas por Cobrar | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Compras / Proveedores | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Reportes y Estadísticas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 🍽️ Módulo Restaurante Completo
- Mapa visual de mesas con estado en tiempo real (Libre, Ocupada, Reservada, Limpieza)
- Zonas configurables: Salón, Terraza, Barra, etc.
- Apertura de órdenes por mesa, para llevar o delivery
- Carrito de platos con modificadores, notas especiales y asignación por comensal
- Envío a cocina con **pantalla KDS** (Kitchen Display System)
- Pago dividido por comensal o cuenta general
- Ruteo de impresión por categoría (cocina, barra, caja)
- Soporte de comprobantes fiscales (NCF) por orden
- Inventario de insumos con descontar automático al cerrar órdenes

### 💰 Punto de Venta (POS)
- Carrito con búsqueda por nombre, SKU y código de barras
- Filtrado por categorías con íconos dinámicos
- Atajos de teclado: `F5` (buscar), `F12` (pagar), `F9` (limpiar), `ESC`
- Métodos de pago: efectivo, tarjeta, crédito y mixto
- Descuentos por ítem y global
- Cálculo automático de cambio

### 🧾 Impresión Térmica
- Soporte para impresoras **TCP/IP** y **USB** vía agente local Node.js
- Formatos: `80mm`, `58mm`, `A4`
- Tickets de venta, precuenta, orden de cocina y cierre de caja
- Comandos ESC/POS directos

### 📊 Caja y Reportes
- Apertura y cierre de caja con arqueo por denominaciones
- Ventas en efectivo y tarjeta **separadas** en el cuadre
- Movimientos de caja (entradas/salidas)
- Reportes de ventas, inventario, órdenes y rendimiento por período
- Dashboard con gráficas en tiempo real

### 🔐 Seguridad y Roles
- Autenticación server-side mediante **Edge Function** (nunca expone password al cliente)
- JWT firmado con secret del proyecto — compatible con RLS de Supabase
- Sistema de roles y permisos granular con toggle por módulo
- Menú dinámico según permisos y módulos activos
- SuperAdmin exclusivo para el desarrollador
- Contraseñas encriptadas con `bcrypt`

### 📡 Offline y Resiliencia
- Modo offline con **Dexie.js** (IndexedDB)
- Sincronización automática al recuperar conexión
- Login offline con credenciales cacheadas

---

## 🛠️ Stack Tecnológico

| Tecnología | Uso |
|-----------|-----|
| **Angular 19** | Framework principal (SPA, standalone components) |
| **TypeScript 5** | Lenguaje de desarrollo |
| **Supabase (PostgreSQL)** | Base de datos, RLS multi-tenant, Realtime, Storage |
| **Supabase Edge Functions (Deno)** | Auth server-side con JWT firmado |
| **Bootstrap 5** | UI y layout responsivo |
| **Font Awesome 6** | Iconografía |
| **SweetAlert2** | Alertas y modales |
| **bcryptjs** | Hash de contraseñas |
| **Dexie.js** | Base de datos local para modo offline |
| **Node.js + Express** | Agente local de impresión térmica (TCP/USB) |
| **Vercel** | Deploy y hosting |

---

## 🚀 Inicio Rápido

### Prerrequisitos
- Node.js 20+
- Angular CLI 19+
- Cuenta en [Supabase](https://supabase.com/)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/Yilsonjr/logospos-billar.git
cd logospos-billar

# 2. Instalar dependencias
npm install --legacy-peer-deps

# 3. Configurar variables de entorno
# Editar: src/app/environment/environment.ts
# Agregar tu SUPABASE_URL y SUPABASE_ANON_KEY

# 4. Ejecutar en desarrollo
npm run start
```

### Variables de Entorno (Vercel)
```
NG_BUILD_CONFIG=production        # o "development" para staging
```

### Configurar Edge Function
```bash
# Desplegar la función de autenticación
npx supabase functions deploy auth-login --project-ref <tu-project-ref>

# Configurar el secreto JWT (mismo valor que SUPABASE_JWT_SECRET)
npx supabase secrets set APP_JWT_SECRET=<valor> --project-ref <tu-project-ref>
```

---

## 🗄️ Base de Datos

### Scripts SQL
Los scripts de migración están en `database/restaurant/` numerados en orden de ejecución:

```
database/restaurant/
├── 01_base_tables.sql          # Tablas principales
├── 02_rls_policies.sql         # Políticas RLS multi-tenant
├── ...
└── 16_modifier_templates.sql   # Plantillas de modificadores
```

### Estructura Multi-Tenant
```
negocios
├── 00000000-0000-0000-0000-000000000000  → LogosPOS Developer (SuperAdmin)
├── [uuid]                                → Restaurante / cliente A
└── [uuid]                                → Bar / cliente B
```

Cada tabla usa `negocio_id` + políticas RLS para que cada tenant solo acceda a sus propios datos.

---

## 👤 Roles del Sistema

| Rol | Descripción |
|----|-------------|
| **SuperAdmin Developer** | Acceso total: gestión de negocios, licencias y todos los módulos |
| **Administrador** | Gestión completa dentro de su negocio |
| **Supervisor** | Reportes, apertura/cierre de caja |
| **Cajero** | Ventas, apertura de caja |
| **Mesero** | Gestión de órdenes y mesas |
| **Cocinero** | Vista KDS de cocina |
| **Solo Lectura** | Consulta sin modificaciones |

---

## 🌿 Ramas

| Rama | Descripción |
|------|-------------|
| `main` | Código en producción — auto-deploy a `food.logospos.com` |
| `staging` | Desarrollo y pruebas — preview en Vercel antes de ir a `main` |

---

## 📁 Estructura del Proyecto

```
src/app/
├── pages/
│   ├── admin/
│   │   ├── developer-negocios/    # Panel SuperAdmin: tenants, licencias, roles
│   │   ├── usuarios/              # Gestión de usuarios por tenant
│   │   └── negocio/               # Identidad y configuración del negocio
│   ├── restaurante/
│   │   ├── floor-map/             # Mapa visual de mesas
│   │   ├── order-modal/           # Gestión de órdenes
│   │   ├── bill-split/            # Pago dividido por comensal
│   │   ├── kitchen-display/       # Pantalla KDS de cocina
│   │   ├── restaurant-admin/      # Menú, inventario, zonas, impresoras
│   │   └── reportes-restaurante/  # Reportes del módulo restaurante
│   ├── ventas/
│   │   ├── pos/                   # Punto de Venta principal
│   │   ├── historial/             # Historial de ventas
│   │   └── mesas/                 # Mesas para billar/bar
│   ├── caja/                      # Apertura, cierre, arqueo y movimientos
│   ├── inventario/                # Productos y categorías (módulo general)
│   ├── clientes/                  # Gestión de clientes
│   ├── reportes/                  # Reportes generales
│   └── dashboard/                 # Dashboard principal por tipo de negocio
├── services/
│   ├── auth.service.ts            # Auth via Edge Function + JWT + RLS
│   ├── negocios.service.ts        # Multi-tenant core + módulos dinámicos
│   ├── caja.service.ts            # Caja con separación efectivo/tarjeta
│   ├── restaurant-orders.service.ts
│   ├── restaurant-tables.service.ts
│   ├── restaurant-reports.service.ts
│   ├── print.service.ts           # Ruteo a impresora térmica
│   └── offline.service.ts         # Sincronización offline
├── shared/
│   ├── navbar/                    # Navbar con módulos dinámicos por rol
│   ├── ticket-cierre/             # Ticket de cierre de caja
│   └── ticket-precuenta/          # Precuenta de mesa
├── models/                        # Interfaces TypeScript
└── environment/                   # Configuración por entorno
    ├── environment.ts             # Staging
    └── environment.prod.ts        # Producción

supabase/
├── functions/auth-login/          # Edge Function: login server-side
└── seeds/demo_data.sql            # Datos demo para pruebas

print-agent/
└── server.js                      # Agente Node.js para impresoras locales
```

---

## 📄 Licencia

Este proyecto es **software privado**. Todos los derechos reservados © 2026 LogosPOS (FOOD).
No se permite la redistribución ni el uso comercial sin autorización expresa del autor.

---

<div align="center">
  <p>Desarrollado con ❤️ por <strong>LogosPOS Team</strong></p>
  <p>
    <a href="mailto:ing.jimrod@gmail.com">📧 ing.jimrod@gmail.com</a>
    &nbsp;·&nbsp;
    <a href="https://food.logospos.com">🌐 food.logospos.com</a>
  </p>
</div>
