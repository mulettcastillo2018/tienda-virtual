"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

function SuccessContent() {
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? params.get("id-transaccion");

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <CheckCircle2 className="mx-auto text-accent" size={56} />
      <h1 className="mt-4 text-2xl font-bold">¡Pago procesado!</h1>
      <p className="mt-2 text-muted-foreground">
        Estamos confirmando tu transacción con Wompi. Te llegará un correo con el detalle de tu pedido
        {orderId ? ` (#${orderId})` : ""} en cuanto se confirme.
      </p>
      <Link href="/" className="mt-6 inline-block font-semibold text-accent">
        Volver al catálogo
      </Link>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
