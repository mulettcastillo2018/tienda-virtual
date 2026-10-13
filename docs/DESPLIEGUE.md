# Publicar una demo de la tienda

Una demo en línea, gratis, con pagos de prueba de Wompi:

| Pieza | Servicio | Plan | Para qué |
|---|---|---|---|
| Base de datos | [Neon](https://neon.tech) | Gratis | PostgreSQL |
| API | [Render](https://render.com) | Gratis | Backend Express (usa `render.yaml`) |
| Frontend | [Vercel](https://vercel.com) | Gratis (Hobby) | Next.js |
| Pagos | [Wompi](https://comercios.wompi.co) | Sandbox | Pagos de prueba, sin dinero real |
| Archivos | Disco del servicio en Render | Incluido | Fotos que se suban y adjuntos de PQRS (ver abajo) |

> **Archivos en la demo:** las imágenes del catálogo inicial vienen de Unsplash. Lo que se suba después (fotos de productos nuevos, adjuntos de PQRS) se guarda en el disco del servicio, que el plan gratis de Render borra al reiniciar. Para conservarlo, ver [Archivos permanentes](#archivos-permanentes-cloudflare-r2).

## 1. Base de datos (Neon)

1. Crea un proyecto **nuevo** (no uses la base de desarrollo) en la región **AWS US East 2 (Ohio)**, la misma de la API en Render.
2. En *Connect*, desactiva *Connection pooling* y copia la cadena de conexión: será `DATABASE_URL`. No la pegues en chats ni la subas al repositorio.
3. Carga las tablas y los datos iniciales **desde tu computador**, apuntando a esa base (el plan gratis de Render no tiene consola). En PowerShell:
   ```powershell
   cd backend
   $env:DATABASE_URL = "<la de Neon>"
   $env:SEED_ADMIN_PASSWORD = "<una contraseña fuerte y nueva, mínimo 12 caracteres>"
   npx prisma migrate deploy
   npx prisma db seed
   Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
   ```
   El seed crea el administrador `admin@tienda.test` con esa contraseña, las categorías y el catálogo de demostración.

## 2. API (Render)

1. En Render → *New* → *Blueprint*, elige este repositorio: Render lee `render.yaml` y crea el servicio `tienda-virtual-api`.
2. Completa las variables marcadas como secretas:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La de Neon |
| `FRONTEND_URL` | La dirección de Vercel (paso 3), p. ej. `https://tienda-virtual-demo.vercel.app` |
| `BACKEND_URL` | La dirección que Render le da al servicio, p. ej. `https://tienda-virtual-api.onrender.com` |
| `WOMPI_*` | Las 4 llaves de **sandbox** |
| `RESEND_API_KEY` | Opcional (sin dominio verificado, Resend solo envía a tu propio correo) |

`JWT_SECRET` y `FILES_SIGNING_SECRET` los genera Render solo (valores aleatorios largos). Si falta alguna variable, el servidor no arranca y el registro de Render dice cuál. Las migraciones se aplican solas en cada arranque.

3. Cuando el despliegue termine, `https://<tu-api>/health` debe responder `{"ok":true,"db":true}`.

## 3. Frontend (Vercel)

1. En Vercel → *Add New* → *Project*, importa este repositorio y en *Root Directory* elige `frontend`. El nombre del proyecto define la dirección (`<nombre>.vercel.app`).
2. Variables de entorno:
   - `NEXT_PUBLIC_API_URL` = la dirección de Render.
   - `NEXT_PUBLIC_SITE_URL` = la dirección pública de la tienda, p. ej. `https://tienda-mulett.vercel.app`. Se usa en los enlaces que leen Google y las redes (canonical, imagen al compartir, `sitemap.xml`, `robots.txt`). Sin ella se toma el dominio de producción que informa Vercel.
3. Despliega y, si la dirección final no es la que pusiste en `FRONTEND_URL`, corrígela en Render.

El inicio y las fichas de producto se arman en el servidor y se guardan un minuto: si la API está dormida, la página espera hasta 8 segundos y luego se arma en el navegador como antes.

## 4. Conectar Wompi

En el panel de Wompi (sandbox) → *Desarrolladores* → *URL de eventos*: `https://<tu-api>/payments/wompi/webhook`. Con el sitio en HTTPS, el widget además devuelve al cliente a la página de resultado del pago.

## 5. Opcional

- **Google / Facebook**: agrega `https://<tu-api>/auth/google/callback` (y el de Facebook) como URI de redirección autorizada y pon las credenciales en Render.
- **Correos a clientes**: verifica un dominio en Resend y cambia `STORE_FROM_EMAIL`. Con eso también salen los recordatorios de carrito abandonado (solo a quien autorizó las ofertas); `CART_REMINDER_AFTER_HOURS` fija las horas de espera (24 por defecto, 0 los apaga).
- **Enlaces de pedidos de invitado y de baja de ofertas**: se firman con `JWT_SECRET`; si quieres una llave aparte, define `ORDER_LINK_SECRET` (cambiarla invalida los enlaces ya enviados). `GUEST_CHECKOUTS_PER_HOUR` limita las compras como invitado por conexión (20 por defecto).
- **Factura electrónica**: se activa en el panel (*Facturación*) con la resolución de la DIAN y la compañía de Alanube. El token puede guardarse allí o, mejor, en Render como `ALANUBE_TOKEN`. La razón social y el NIT se completan en *Contacto*. Sin todo eso, la tienda vende igual y no emite documentos.
- **Pago contra entrega**: se configura en el panel (*Métodos de pago*): ciudades, valor máximo y recargo. La migración lo deja activo en Bogotá, Medellín, Cali, Barranquilla y Bucaramanga, hasta $500.000 y sin recargo.

## Archivos permanentes (Cloudflare R2)

Para que las fotos subidas y los adjuntos no se pierdan, usa un almacenamiento compatible con S3. R2 da 10 GB gratis y no cobra transferencia (pide registrar un medio de pago para activarlo):

1. En Cloudflare → R2, crea dos buckets: `tienda-publico` y `tienda-privado`.
2. En `tienda-publico` → *Settings* → *Public access*: activa el subdominio `r2.dev` (o conecta un dominio propio). Esa dirección es `PUBLIC_FILES_URL`. **No** actives el acceso público en `tienda-privado`.
3. En R2 → *Manage API tokens*, crea un token con permiso **Object Read & Write** solo para esos dos buckets. Guarda el *Access Key ID* y el *Secret Access Key*.
4. En Render pon `STORAGE_DRIVER=s3`, `S3_REGION=auto`, `S3_PUBLIC_BUCKET=tienda-publico`, `S3_PRIVATE_BUCKET=tienda-privado`, `S3_ENDPOINT=https://<id de tu cuenta>.r2.cloudflarestorage.com`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` y `PUBLIC_FILES_URL`.
5. En Vercel agrega `NEXT_PUBLIC_FILES_URL` = `PUBLIC_FILES_URL` (para que Next.js permita mostrar las imágenes del bucket) y vuelve a desplegar.

Otros proveedores S3 que exigen rutas tipo `endpoint/bucket` (Supabase Storage, MinIO) necesitan además `S3_FORCE_PATH_STYLE=true`.

## Qué tener en cuenta

- El plan gratis de Render **duerme el servicio** tras 15 minutos sin uso: la primera visita puede tardar cerca de un minuto. Mientras duerme, los pedidos vencidos se cancelan cuando se despierta.
- Es una demo: usa solo llaves de **sandbox** de Wompi y tarjetas de prueba.
- Las contraseñas de prueba que aparecen en el historial del repositorio no deben usarse en la demo.
