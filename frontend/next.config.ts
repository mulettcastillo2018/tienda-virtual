import type { NextConfig } from "next";

// Las imágenes subidas se sirven desde la API (o, más adelante, desde el
// almacenamiento que se elija): se permite ese origen, sea cual sea.
const filesOrigin = new URL(process.env.NEXT_PUBLIC_FILES_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: filesOrigin.protocol.replace(":", "") as "http" | "https",
        hostname: filesOrigin.hostname,
        port: filesOrigin.port,
        pathname: "/uploads/**",
      },
    ],
  },
  // Cabeceras de seguridad de todas las páginas: no se pueden incrustar en
  // otros sitios (clickjacking), el navegador no adivina tipos de archivo y no
  // se filtra la URL completa (que puede llevar códigos) a otros dominios.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
