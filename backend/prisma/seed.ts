import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@tienda.test" },
    update: {},
    create: {
      email: "admin@tienda.test",
      passwordHash: await bcrypt.hash("admin1234", 10),
      role: "ADMIN",
    },
  });
  await prisma.cart.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  const electronica = await prisma.category.upsert({
    where: { slug: "electronica" },
    update: {},
    create: { name: "Electrónica", slug: "electronica" },
  });
  const hogar = await prisma.category.upsert({
    where: { slug: "hogar" },
    update: {},
    create: { name: "Hogar", slug: "hogar" },
  });

  await prisma.product.upsert({
    where: { sku: "AUD-001" },
    update: {},
    create: {
      name: "Audífonos inalámbricos",
      description: "Audífonos bluetooth con cancelación de ruido.",
      price: 129_000,
      stock: 25,
      categoryId: electronica.id,
      images: [],
      weightInGrams: 250,
      widthCm: 18,
      heightCm: 20,
      depthCm: 8,
      sku: "AUD-001",
    },
  });

  await prisma.product.upsert({
    where: { sku: "LAM-001" },
    update: {},
    create: {
      name: "Lámpara de escritorio LED",
      description: "Lámpara regulable con puerto USB.",
      price: 79_000,
      stock: 40,
      categoryId: hogar.id,
      images: [],
      weightInGrams: 600,
      widthCm: 15,
      heightCm: 40,
      depthCm: 15,
      sku: "LAM-001",
    },
  });

  console.log("Seed completado. Admin: admin@tienda.test / admin1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
