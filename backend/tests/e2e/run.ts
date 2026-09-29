// Pruebas de extremo a extremo contra el backend corriendo (npm run dev).
// Uso: npm run test:e2e [-- filtro]
import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { comprobarEntorno, totalFallos } from "./_utilidades";
import { probarPagos } from "./pagos.e2e";
import { probarCuentas } from "./cuentas.e2e";
import { probarArchivos } from "./archivos.e2e";
import { probarAlmacenamiento } from "./almacenamiento.e2e";

const PRUEBAS: [string, () => Promise<void>][] = [
  ["Pagos con Wompi", probarPagos],
  ["Seguridad de las cuentas", probarCuentas],
  ["Archivos subidos", probarArchivos],
  ["Almacenamiento en la nube (S3 simulado)", probarAlmacenamiento],
];

async function main() {
  comprobarEntorno();
  const filtro = process.argv[2]?.toLowerCase();
  let errores = 0;
  for (const [nombre, probar] of PRUEBAS) {
    if (filtro && !nombre.toLowerCase().includes(filtro)) continue;
    console.log(`\n=== ${nombre} ===`);
    try {
      await probar();
    } catch (err) {
      errores++;
      console.error("  ERROR:", err);
    }
  }
  const fallos = totalFallos() + errores;
  console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`} — datos de prueba eliminados.`);
  return fallos;
}

main()
  .then(async (fallos) => {
    await prisma.$disconnect();
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err.message ?? err);
    await prisma.$disconnect();
    process.exit(1);
  });
