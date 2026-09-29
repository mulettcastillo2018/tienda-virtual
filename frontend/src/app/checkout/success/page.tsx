"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Dirección anterior de retorno de Wompi: los pagos iniciados antes del
// cambio todavía pueden volver aquí. El resultado real está en /checkout/result.
function RedirectToResult() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const orderId = params.get("orderId");
    router.replace(orderId ? `/checkout/result?orderId=${encodeURIComponent(orderId)}` : "/account");
  }, [params, router]);
  return null;
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <RedirectToResult />
    </Suspense>
  );
}
