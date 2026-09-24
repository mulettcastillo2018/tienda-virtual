# Tienda Virtual — Colombia (Wompi)

E-commerce de productos físicos, construido siguiendo `Prompts_Tienda_Virtual_Claude_Code.pdf`. Proyecto independiente del portafolio (`../portafolio-web`).

## Arquitectura

```
tienda-virtual/
├── backend/    Node.js + Express + TypeScript + Prisma (PostgreSQL)
└── frontend/   Next.js (App Router) + TypeScript + Tailwind CSS
```

Son dos aplicaciones separadas (no un monorepo con workspaces), cada una con su propio `package.json`, `node_modules` y ciclo de vida.

- **Backend**: API REST en capas (routes → servicios → Prisma). Autenticación JWT, carrito persistido en base de datos, checkout con cálculo de envío, pagos con Wompi (firma de integridad + webhook validado), correos transaccionales con Resend.
- **Frontend**: catálogo, carrito (Zustand), checkout tipo stepper con el widget de Wompi.

## Requisitos previos

1. **PostgreSQL**: cuenta gratuita en [Neon](https://neon.tech) o [Supabase](https://supabase.com), y su `DATABASE_URL`.
2. **Wompi (sandbox)**: cuenta gratuita en [comercios.wompi.co](https://comercios.wompi.co) → sección de llaves → copiar las 4 llaves de **Sandbox** (`pub_test_...`, `prv_test_...`, `test_events_...`, `test_integrity_...`).
3. **Resend**: cuenta gratuita en [resend.com](https://resend.com) → API key.

## Correr en local

**Backend** (puerto 4000):
```bash
cd backend
npm install
cp .env.example .env   # y completa las variables
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

**Frontend** (puerto 3000):
```bash
cd frontend
npm install
cp .env.example .env.local   # y completa NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev
```

## Tarjetas de prueba (Wompi Sandbox)

- **Aprobada**: `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC.
- **Rechazada**: `4111 1111 1111 1111`, cualquier fecha futura, cualquier CVC.

## Usuario admin de prueba (después del seed)

`admin@tienda.test` / `admin1234`

## Nota: binarios de Prisma bloqueados por el proxy corporativo

En este entorno, el proxy (McAfee Web Gateway) bloquea la descarga automática de los motores nativos de Prisma (no son paquetes de npm, se descargan de `binaries.prisma.sh`). Si en algún momento se borra `backend/node_modules` y hay que reinstalar:

1. Descargar manualmente por navegador (el bloqueo no aplica a descargas iniciadas desde el navegador):
   - `https://binaries.prisma.sh/all_commits/<version>/windows/query_engine.dll.node.gz`
   - `https://binaries.prisma.sh/all_commits/<version>/windows/schema-engine.exe.gz`
   (el `<version>` exacto está en `backend/node_modules/@prisma/engines-version` después de `npm install`, o en el mensaje de error que da `prisma generate`).
2. Descomprimirlos (`gzip -d`) y colocarlos en `backend/node_modules/@prisma/engines/` con estos nombres exactos:
   - `query_engine-windows.dll.node`
   - `schema-engine-windows.exe`
3. Agregar `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` al `.env` del backend (evita que Prisma intente verificar un checksum en línea antes de usar el archivo local).
4. Correr `npx prisma generate` de nuevo.

## Estado del proyecto

En construcción activa — se está siguiendo el plan por fases (estructura → base de datos → API → Wompi → frontend → correos → envíos → panel admin). El despliegue a producción (hosting del backend, dominio, llaves reales de Wompi) queda para más adelante.
