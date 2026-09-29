# Publicar una demo de la tienda

Una demo en línea, gratis, con pagos de prueba de Wompi:

| Pieza | Servicio | Plan | Para qué |
|---|---|---|---|
| Base de datos | [Neon](https://neon.tech) | Gratis | PostgreSQL |
| API | [Render](https://render.com) | Gratis | Backend Express (usa `render.yaml`) |
| Frontend | [Vercel](https://vercel.com) | Gratis (Hobby) | Next.js |
| Archivos | [Cloudflare R2](https://developers.cloudflare.com/r2/) | Gratis hasta 10 GB | Imágenes de productos y adjuntos de PQRS |
| Pagos | [Wompi](https://comercios.wompi.co) | Sandbox | Pagos de prueba, sin dinero real |

> **Por qué R2:** el disco de Render (plan gratis) se borra en cada despliegue, así que los archivos subidos tienen que vivir afuera. R2 es compatible con S3 (el mismo código sirve para AWS S3) y no cobra por la transferencia.

## 1. Base de datos (Neon)

1. Crea un proyecto nuevo (no uses la base de desarrollo), en la región **AWS US East 2 (Ohio)**, la misma de la API en Render.
2. Copia la cadena de conexión: será `DATABASE_URL`.
3. Carga los datos iniciales **desde tu computador**, apuntando a esa base (el plan gratis de Render no tiene consola):
   ```bash
   cd backend
   DATABASE_URL="<la de Neon>" npx prisma migrate deploy
   DATABASE_URL="<la de Neon>" SEED_ADMIN_PASSWORD="<una contraseña fuerte, nueva>" npx prisma db seed
   ```

## 2. Archivos (Cloudflare R2)

1. En Cloudflare → R2, crea dos buckets: `tienda-publico` y `tienda-privado`.
2. En `tienda-publico` → *Settings* → *Public access*: activa el subdominio `r2.dev` (o conecta un dominio propio). Esa dirección es `PUBLIC_FILES_URL`. **No** actives el acceso público en `tienda-privado`.
3. En R2 → *Manage API tokens*, crea un token con permiso **Object Read & Write** solo para esos dos buckets. Guarda el *Access Key ID* y el *Secret Access Key*.
4. El endpoint es `https://<id de tu cuenta>.r2.cloudflarestorage.com` (aparece en la página del token): será `S3_ENDPOINT`.

## 3. API (Render)

1. En Render → *New* → *Blueprint*, elige este repositorio: Render lee `render.yaml` y crea el servicio `tienda-virtual-api`.
2. Completa las variables marcadas como secretas:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La de Neon |
| `FRONTEND_URL` | La dirección de Vercel (paso 4), p. ej. `https://tienda-virtual.vercel.app` |
| `BACKEND_URL` | La dirección que Render le da al servicio, p. ej. `https://tienda-virtual-api.onrender.com` |
| `PUBLIC_FILES_URL` | La dirección pública de `tienda-publico` |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Los de R2 |
| `WOMPI_*` | Las 4 llaves de **sandbox** |
| `RESEND_API_KEY` | Opcional (sin dominio verificado, Resend solo envía a tu propio correo) |

`JWT_SECRET` y `FILES_SIGNING_SECRET` los genera Render solo (valores aleatorios largos). Si falta alguna variable, el servidor no arranca y el registro de Render dice cuál.

3. Cuando el despliegue termine, `https://<tu-api>/health` debe responder `{"ok":true,"db":true}`.

## 4. Frontend (Vercel)

1. En Vercel → *Add New Project*, importa este repositorio y en *Root Directory* elige `frontend`.
2. Variables de entorno:
   - `NEXT_PUBLIC_API_URL` = la dirección de Render.
   - `NEXT_PUBLIC_FILES_URL` = `PUBLIC_FILES_URL` (para que Next.js permita mostrar las imágenes del bucket).
3. Despliega y vuelve a Render para poner `FRONTEND_URL` con la dirección definitiva.

## 5. Conectar Wompi

En el panel de Wompi (sandbox) → *Desarrolladores* → *URL de eventos*: `https://<tu-api>/payments/wompi/webhook`. Con el sitio en HTTPS, el widget además devuelve al cliente a la página de resultado del pago.

## 6. Opcional

- **Google / Facebook**: agrega `https://<tu-api>/auth/google/callback` (y el de Facebook) como URI de redirección autorizada y pon las credenciales en Render.
- **Correos a clientes**: verifica un dominio en Resend y cambia `STORE_FROM_EMAIL`.

## Qué tener en cuenta

- El plan gratis de Render **duerme el servicio** tras 15 minutos sin uso: la primera visita puede tardar cerca de un minuto. Mientras duerme, los pedidos vencidos se cancelan cuando se despierta.
- Es una demo: usa solo llaves de **sandbox** de Wompi y tarjetas de prueba.
- Las contraseñas de prueba que aparecen en el historial del repositorio no deben usarse en la demo.
