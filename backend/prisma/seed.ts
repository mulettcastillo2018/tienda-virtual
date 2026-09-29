import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function image(unsplashId: string) {
  return `https://images.unsplash.com/photo-${unsplashId}?w=800&h=800&fit=crop`;
}

async function main() {
  // Sin contraseña por defecto: una conocida (antes "admin1234") dejaría el
  // panel abierto si el seed se corre en producción. Solo se usa al crear el
  // administrador; si ya existe, su contraseña no cambia.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("Define SEED_ADMIN_PASSWORD (mínimo 12 caracteres) en el .env antes de correr el seed.");
  }
  const admin = await prisma.user.upsert({
    where: { email: "admin@tienda.test" },
    update: {},
    create: {
      email: "admin@tienda.test",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
    },
  });
  await prisma.cart.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  const categories = {
    electronica: await prisma.category.upsert({
      where: { slug: "electronica" },
      update: {},
      create: { name: "Electrónica", slug: "electronica" },
    }),
    hogar: await prisma.category.upsert({
      where: { slug: "hogar" },
      update: {},
      create: { name: "Hogar", slug: "hogar" },
    }),
    moda: await prisma.category.upsert({
      where: { slug: "moda" },
      update: {},
      create: { name: "Moda", slug: "moda" },
    }),
    deportes: await prisma.category.upsert({
      where: { slug: "deportes" },
      update: {},
      create: { name: "Deportes", slug: "deportes" },
    }),
  };

  const products = [
    {
      sku: "AUD-001",
      image: "1505740420928-5e560c06d30e",
      name: "Audífonos inalámbricos",
      description: "Audífonos bluetooth con cancelación de ruido.",
      price: 129_000,
      stock: 25,
      category: categories.electronica,
      weightInGrams: 250,
      widthCm: 18,
      heightCm: 20,
      depthCm: 8,
    },
    {
      sku: "PAR-001",
      image: "1608043152269-423dbba4e7e1",
      name: "Parlante Bluetooth portátil",
      description: "Sonido envolvente, resistente al agua (IPX6), 12 horas de batería.",
      price: 149_000,
      stock: 18,
      category: categories.electronica,
      weightInGrams: 480,
      widthCm: 12,
      heightCm: 12,
      depthCm: 12,
    },
    {
      sku: "MOU-001",
      image: "1527864550417-7fd91fc51a46",
      name: "Mouse inalámbrico ergonómico",
      description: "Diseño ergonómico, sensor óptico de precisión, silencioso.",
      price: 69_000,
      stock: 30,
      category: categories.electronica,
      weightInGrams: 110,
      widthCm: 6,
      heightCm: 4,
      depthCm: 11,
    },
    {
      sku: "CAR-001",
      image: "1583863788434-e58a36330cf0",
      name: "Cargador rápido USB-C 30W",
      description: "Carga rápida compatible con la mayoría de celulares y tablets.",
      price: 45_000,
      stock: 40,
      category: categories.electronica,
      weightInGrams: 90,
      widthCm: 5,
      heightCm: 5,
      depthCm: 3,
    },
    {
      sku: "LAM-001",
      image: "1507473885765-e6ed057f782c",
      name: "Lámpara de escritorio LED",
      description: "Lámpara regulable con puerto USB.",
      price: 79_000,
      stock: 40,
      category: categories.hogar,
      weightInGrams: 600,
      widthCm: 15,
      heightCm: 40,
      depthCm: 15,
    },
    {
      sku: "ORG-001",
      image: "1587145820266-a5951ee6f620",
      name: "Organizador de escritorio de bambú",
      description: "Compartimentos para lápices, celular y accesorios de oficina.",
      price: 55_000,
      stock: 22,
      category: categories.hogar,
      weightInGrams: 700,
      widthCm: 25,
      heightCm: 15,
      depthCm: 12,
    },
    {
      sku: "DIF-001",
      image: "1608571423902-eed4a5ad8108",
      name: "Difusor de aromas ultrasónico",
      description: "Con luz LED de colores, ideal para espacios pequeños.",
      price: 89_000,
      stock: 15,
      category: categories.hogar,
      weightInGrams: 450,
      widthCm: 14,
      heightCm: 16,
      depthCm: 14,
    },
    {
      sku: "TAZ-001",
      image: "1517256064527-09c73fc73e38",
      name: "Set de tazas de cerámica x4",
      description: "Diseño minimalista, aptas para microondas y lavavajillas.",
      price: 65_000,
      stock: 20,
      category: categories.hogar,
      weightInGrams: 1200,
      widthCm: 20,
      heightCm: 12,
      depthCm: 20,
    },
    {
      sku: "MOC-001",
      image: "1553062407-98eeb64c6a62",
      name: "Mochila urbana antirrobo",
      description: "Compartimento acolchado para portátil, puerto USB externo.",
      price: 159_000,
      stock: 12,
      category: categories.moda,
      weightInGrams: 850,
      widthCm: 30,
      heightCm: 45,
      depthCm: 15,
    },
    {
      sku: "GOR-001",
      image: "1521369909029-2afed882baee",
      name: "Gorra unisex ajustable",
      description: "Algodón transpirable, ajuste trasero universal.",
      price: 39_000,
      stock: 35,
      category: categories.moda,
      weightInGrams: 120,
      widthCm: 20,
      heightCm: 15,
      depthCm: 20,
    },
    {
      sku: "BIL-001",
      image: "1627123424574-724758594e93",
      name: "Billetera de cuero minimalista",
      description: "Cuero genuino, diseño delgado con protección RFID.",
      price: 75_000,
      stock: 20,
      category: categories.moda,
      weightInGrams: 90,
      widthCm: 10,
      heightCm: 8,
      depthCm: 1,
    },
    {
      sku: "BOT-001",
      image: "1602143407151-7111542de6e8",
      name: "Botella térmica deportiva 750ml",
      description: "Mantiene la temperatura hasta 12 horas, acero inoxidable.",
      price: 59_000,
      stock: 28,
      category: categories.deportes,
      weightInGrams: 350,
      widthCm: 8,
      heightCm: 26,
      depthCm: 8,
    },
    {
      sku: "BAN-001",
      image: "1598289431512-b97b0917affc",
      name: "Bandas de resistencia (set x3)",
      description: "Distintos niveles de resistencia, incluye bolsa de transporte.",
      price: 49_000,
      stock: 25,
      category: categories.deportes,
      weightInGrams: 300,
      widthCm: 15,
      heightCm: 20,
      depthCm: 5,
    },
  ];

  for (const p of products) {
    const data = {
      name: p.name,
      description: p.description,
      price: p.price,
      stock: p.stock,
      categoryId: p.category.id,
      images: [image(p.image)],
      weightInGrams: p.weightInGrams,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      depthCm: p.depthCm,
    };
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: data,
      create: { ...data, sku: p.sku },
    });
  }

  console.log(`Seed completado. ${products.length} productos. Admin: admin@tienda.test / admin1234`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
