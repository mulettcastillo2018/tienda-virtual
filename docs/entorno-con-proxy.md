# Desarrollar detrás de un proxy corporativo

Notas para trabajar en una red que bloquea descargas de binarios o inspecciona el tráfico HTTPS. En una red normal nada de esto hace falta.

## Motores de Prisma

Algunos proxies bloquean la descarga automática de los motores nativos de Prisma (no son paquetes de npm; se descargan de `binaries.prisma.sh`). Si al reinstalar `node_modules` falla `prisma generate`:

1. Descargar manualmente, desde el navegador:
   - `https://binaries.prisma.sh/all_commits/<version>/windows/query_engine.dll.node.gz`
   - `https://binaries.prisma.sh/all_commits/<version>/windows/schema-engine.exe.gz`

   El `<version>` exacto está en `backend/node_modules/@prisma/engines-version` o en el mensaje de error de `prisma generate`.
2. Descomprimirlos (`gzip -d`) y dejarlos en una carpeta del backend, por ejemplo `.prisma-engines/` (ignorada por Git).
3. Apuntar a ellos desde el `.env`:
   ```
   PRISMA_QUERY_ENGINE_LIBRARY="./.prisma-engines/query_engine.dll.node"
   PRISMA_SCHEMA_ENGINE_BINARY="./.prisma-engines/schema-engine.exe"
   ```
4. Correr `npx prisma generate` de nuevo.

## Certificados para llamadas HTTPS salientes

Si el proxy inspecciona HTTPS, Node.js no confía en su certificado y fallan las llamadas a APIs externas (Wompi, Resend, Google). Se soluciona usando los certificados del sistema operativo:

```bash
NODE_OPTIONS=--use-system-ca npm run dev
NODE_OPTIONS=--use-system-ca npm run test:e2e
```

## ESLint

Algunas dependencias nativas de ESLint quedaban bloqueadas, así que el proyecto se construyó sin él. La verificación de tipos (`tsc`) corre en local y en la integración continua.
