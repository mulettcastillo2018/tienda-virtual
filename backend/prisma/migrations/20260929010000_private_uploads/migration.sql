-- CreateTable
CREATE TABLE "UploadedFile" (
    "key" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "UploadedFile_ownerId_idx" ON "UploadedFile"("ownerId");

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Datos: imágenes propias de productos como ruta relativa (sin dominio), para
-- que cambiar de dominio no rompa ninguna imagen.
UPDATE "Product" SET "images" = ARRAY(
  SELECT regexp_replace(img, '^https?://[^/]+(/uploads/products/)', '\1')
  FROM unnest("images") WITH ORDINALITY AS t(img, pos)
  ORDER BY pos
)
WHERE EXISTS (SELECT 1 FROM unnest("images") AS i(img) WHERE img ~ '^https?://[^/]+/uploads/products/');

-- Datos: adjuntos de PQRS como clave privada (los archivos pasan de
-- uploads/pqrs a uploads-private/pqrs, que no se publica).
UPDATE "Pqrs" SET "attachmentUrl" = regexp_replace("attachmentUrl", '^https?://[^/]+/uploads/pqrs/', 'pqrs/')
WHERE "attachmentUrl" ~ '^https?://[^/]+/uploads/pqrs/';
UPDATE "Pqrs" SET "responseAttachmentUrl" = regexp_replace("responseAttachmentUrl", '^https?://[^/]+/uploads/pqrs/', 'pqrs/')
WHERE "responseAttachmentUrl" ~ '^https?://[^/]+/uploads/pqrs/';
UPDATE "PqrsStatusLog" SET "attachmentUrl" = regexp_replace("attachmentUrl", '^https?://[^/]+/uploads/pqrs/', 'pqrs/')
WHERE "attachmentUrl" ~ '^https?://[^/]+/uploads/pqrs/';
