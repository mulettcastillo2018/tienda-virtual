import { ImageResponse } from "next/og";

// Imagen al compartir la tienda (WhatsApp, redes). Las fichas de producto usan
// la foto del producto en su lugar.
export const alt = "Tienda Virtual: compra con envío a toda Colombia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#fbfaf8",
          color: "#141217",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 800,
            backgroundImage: "linear-gradient(90deg, #d4402a, #e0245e, #7c3aed)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Tienda Virtual
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Compra fácil, recibe en toda Colombia
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#5f5a66" }}>Pago seguro con tarjeta, PSE y Nequi</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Envío nacional", "Ofertas relámpago", "Atención por WhatsApp"].map((label) => (
            <div
              key={label}
              style={{ display: "flex", padding: "12px 24px", borderRadius: 999, background: "#141217", color: "#fbfaf8", fontSize: 26 }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
