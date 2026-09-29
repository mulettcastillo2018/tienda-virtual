import { Resend } from "resend";

interface OrderItemForEmail {
  productName: string;
  quantity: number;
  priceAtPurchase: number;
}

interface OrderForEmail {
  id: string;
  totalAmount: number;
  shippingCost: number;
  items: OrderItemForEmail[];
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    city: string;
    state: string;
  };
}

interface PaymentDetailsForEmail {
  providerTransactionId: string | null;
  paymentMethod: string | null;
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

// Todo valor que venga de usuarios (asunto y respuesta de PQRS, nombre y
// dirección, productos, guía) se escapa antes de ir al HTML del correo: si no,
// alguien podría meter enlaces o contenido engañoso en un correo de la tienda.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// El dominio .test está reservado y nunca recibe correo (lo usan las cuentas
// de prueba): no se gasta un envío en él.
function isUndeliverable(toEmail: string): boolean {
  return toEmail.toLowerCase().endsWith(".test");
}

export async function sendOrderConfirmationEmail(
  toEmail: string,
  order: OrderForEmail,
  payment: PaymentDetailsForEmail
) {
  if (isUndeliverable(toEmail)) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado — se omite el envío del correo de confirmación.");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.STORE_FROM_EMAIL ?? "Tienda Virtual <onboarding@resend.dev>";

  const itemsHtml = order.items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0">${escapeHtml(item.productName)} × ${item.quantity}</td><td style="padding:6px 0;text-align:right">${formatCOP(item.priceAtPurchase * item.quantity)}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>¡Gracias por tu compra!</h2>
      <p>Pedido <strong>#${escapeHtml(order.id)}</strong> confirmado.</p>
      <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
      <p>Envío: ${formatCOP(order.shippingCost)}</p>
      <p><strong>Total: ${formatCOP(order.totalAmount)}</strong></p>
      <p>Transacción Wompi: ${escapeHtml(payment.providerTransactionId ?? "-")} (${escapeHtml(payment.paymentMethod ?? "-")})</p>
      <h3>Dirección de entrega</h3>
      <p>${escapeHtml(order.shippingAddress.fullName)}<br />${escapeHtml(order.shippingAddress.addressLine1)}<br />${escapeHtml(order.shippingAddress.city)}, ${escapeHtml(order.shippingAddress.state)}</p>
    </div>
  `;

  await resend.emails.send({
    from,
    to: toEmail,
    subject: `Confirmación de tu pedido #${order.id}`,
    html,
  });
}

export async function sendShippingNotificationEmail(
  toEmail: string,
  orderId: string,
  carrier: string,
  trackingNumber: string
) {
  if (isUndeliverable(toEmail)) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado — se omite el envío del correo de despacho.");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.STORE_FROM_EMAIL ?? "Tienda Virtual <onboarding@resend.dev>";

  await resend.emails.send({
    from,
    to: toEmail,
    subject: `Tu pedido #${orderId} fue despachado`,
    html: `<p>Tu pedido fue despachado con <strong>${escapeHtml(carrier)}</strong>.</p><p>Número de guía: <strong>${escapeHtml(trackingNumber)}</strong></p>`,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string) {
  if (isUndeliverable(toEmail)) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado — se omite el envío del correo de reseteo.");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.STORE_FROM_EMAIL ?? "Tienda Virtual <onboarding@resend.dev>";

  await resend.emails.send({
    from,
    to: toEmail,
    subject: "Restablece tu contraseña",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Restablece tu contraseña</h2>
        <p>Solicitaste restablecer tu contraseña. Este enlace es válido por 30 minutos.</p>
        <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:9999px;">Restablecer contraseña</a></p>
        <p>Si no solicitaste esto, puedes ignorar este correo.</p>
      </div>
    `,
  });
}

export async function sendPqrsUpdateEmail(
  toEmail: string,
  pqrs: { id: string; subject: string; status: string; response: string | null }
) {
  if (isUndeliverable(toEmail)) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado — se omite el envío del correo de PQRS.");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.STORE_FROM_EMAIL ?? "Tienda Virtual <onboarding@resend.dev>";
  const statusLabels: Record<string, string> = {
    RECIBIDO: "Recibido",
    EN_PROCESO: "En proceso",
    RESUELTO: "Resuelto",
    CERRADO: "Cerrado",
  };

  await resend.emails.send({
    from,
    to: toEmail,
    subject: `Actualización de tu PQRS #${pqrs.id.slice(-8)}: ${pqrs.subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Actualización de tu solicitud</h2>
        <p><strong>Asunto:</strong> ${escapeHtml(pqrs.subject)}</p>
        <p><strong>Estado:</strong> ${escapeHtml(statusLabels[pqrs.status] ?? pqrs.status)}</p>
        ${pqrs.response ? `<p><strong>Respuesta:</strong></p><p style="white-space:pre-line">${escapeHtml(pqrs.response)}</p>` : ""}
        <p>Puedes ver el detalle completo desde tu cuenta.</p>
      </div>
    `,
  });
}
