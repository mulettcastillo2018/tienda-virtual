import { z } from "zod";

// Revisa la configuración al arrancar: si falta algo, el servidor no inicia y
// dice exactamente qué falta (en vez de fallar en la primera petición que lo
// necesite).
const isProduction = process.env.NODE_ENV === "production";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: isProduction ? z.string().min(32, "debe tener al menos 32 caracteres en producción") : z.string().min(1),
  WOMPI_PUBLIC_KEY: z.string().min(1),
  WOMPI_INTEGRITY_SECRET: z.string().min(1),
  WOMPI_EVENTS_SECRET: z.string().min(1),
  FRONTEND_URL: isProduction ? z.string().url() : z.string().url().optional(),
  BACKEND_URL: isProduction ? z.string().url().startsWith("https://", "debe ser https en producción") : z.string().url().optional(),
  PUBLIC_FILES_URL: z.string().url().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).optional(),
}).superRefine((env, ctx) => {
  // En modo s3 hacen falta el bucket público (con su dirección) y el privado.
  if (env.STORAGE_DRIVER !== "s3") return;
  for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BUCKET", "S3_PRIVATE_BUCKET", "PUBLIC_FILES_URL"]) {
    if (!process.env[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "falta (necesaria con STORAGE_DRIVER=s3)" });
  }
});

export function checkEnvironment() {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return;
  const problems = parsed.error.issues.map((i) => {
    const key = i.path.join(".");
    const missing = !process.env[key];
    return `  - ${key}: ${missing ? "falta" : i.message}`;
  });
  console.error(`La configuración del servidor está incompleta (revisa el .env o las variables del hosting):\n${problems.join("\n")}`);
  process.exit(1);
}
