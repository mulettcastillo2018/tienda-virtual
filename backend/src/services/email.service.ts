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

export async function sendOrderConfirmationEmail(
  toEmail: string,
  order: OrderForEmail,
  payment: PaymentDetailsForEmail
) {
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
        `<tr><td style="padding:6px 0">${item.productName} × ${item.quantity}</td><td style="padding:6px 0;text-align:right">${formatCOP(item.priceAtPurchase * item.quantity)}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>¡Gracias por tu compra!</h2>
      <p>Pedido <strong>#${order.id}</strong> confirmado.</p>
      <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
      <p>Envío: ${formatCOP(order.shippingCost)}</p>
      <p><strong>Total: ${formatCOP(order.totalAmount)}</strong></p>
      <p>Transacción Wompi: ${payment.providerTransactionId ?? "-"} (${payment.paymentMethod ?? "-"})</p>
      <h3>Dirección de entrega</h3>
      <p>${order.shippingAddress.fullName}<br />${order.shippingAddress.addressLine1}<br />${order.shippingAddress.city}, ${order.shippingAddress.state}</p>
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
    html: `<p>Tu pedido fue despachado con <strong>${carrier}</strong>.</p><p>Número de guía: <strong>${trackingNumber}</strong></p>`,
  });
}
