"use client";

import { useLocale } from "@/lib/i18n";

export default function DevolucionesPage() {
  const locale = useLocale();

  if (locale === "en") {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
        <h1 className="px-1 text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Returns and Warranty Policy</h1>
        <p className="mt-3 px-1 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-8 space-y-8 rounded-[2rem] border border-border bg-surface p-6 text-[15px] leading-relaxed text-muted-foreground shadow-suave sm:p-10">
          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Right of withdrawal</h2>
            <p className="mt-2">
              In accordance with article 47 of Law 1480 of 2011 (Colombian Consumer Statute), you have the right to
              withdraw from your purchase within <strong>5 business days</strong> following delivery of the
              product, without needing to justify your decision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Return conditions</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-border-strong">
              <li>The product must be unused, in its original packaging, with all its accessories.</li>
              <li>It must keep its tags and show no signs of use or damage.</li>
              <li>The return must be reported within the timeframe indicated above.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">How to request a return</h2>
            <p className="mt-2">
              Write to us with your order number (found in{" "}
              <a href="/account" className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-accent">
                your account
              </a>
              ) and the reason for the return. We'll let you know the next steps, including the return address if
              applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Refunds</h2>
            <p className="mt-2">
              Once the returned product is received and verified, the refund is issued through the same payment
              method used in the purchase, within up to 15 business days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Legal warranty</h2>
            <p className="mt-2">
              All products carry the minimum legal warranty established by Law 1480 of 2011. If your product
              arrives defective or has manufacturing flaws, contact us to arrange a repair, exchange, or refund, as
              applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Exceptions</h2>
            <p className="mt-2">
              The right of withdrawal does not apply to customized products or those that, by their nature, cannot
              be returned for hygiene reasons once unsealed.
            </p>
          </section>

          <p className="border-t border-border pt-6 text-xs italic">
            This text is a base template and should be reviewed by legal counsel before operating commercially.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <h1 className="px-1 text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Política de devoluciones y garantías</h1>
      <p className="mt-3 px-1 text-sm text-muted-foreground">Última actualización: {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-8 rounded-[2rem] border border-border bg-surface p-6 text-[15px] leading-relaxed text-muted-foreground shadow-suave sm:p-10">
        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Derecho de retracto</h2>
          <p className="mt-2">
            De acuerdo con el artículo 47 de la Ley 1480 de 2011 (Estatuto del Consumidor colombiano), tienes
            derecho a retractarte de tu compra dentro de los <strong>5 días hábiles</strong> siguientes a la
            entrega del producto, sin necesidad de justificar tu decisión.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Condiciones para la devolución</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-border-strong">
            <li>El producto debe estar sin usar, en su empaque original y con todos sus accesorios.</li>
            <li>Debe conservar etiquetas y no presentar señales de uso o daño.</li>
            <li>Se debe informar la devolución dentro del plazo indicado arriba.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Cómo solicitar una devolución</h2>
          <p className="mt-2">
            Escríbenos indicando el número de tu pedido (lo encuentras en{" "}
            <a href="/account" className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-accent">
              tu cuenta
            </a>
            ) y el motivo de la devolución. Te indicaremos los pasos siguientes, incluyendo la dirección de
            devolución si aplica.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Reembolsos</h2>
          <p className="mt-2">
            Una vez recibido y verificado el producto devuelto, el reembolso se realiza por el mismo medio de
            pago utilizado en la compra, en un plazo de hasta 15 días hábiles.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Garantía legal</h2>
          <p className="mt-2">
            Todos los productos cuentan con la garantía legal mínima establecida en la Ley 1480 de 2011. Si tu
            producto llega defectuoso o presenta fallas de fabricación, contáctanos para gestionar la reparación,
            cambio o devolución del dinero, según corresponda.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Excepciones</h2>
          <p className="mt-2">
            No aplica el derecho de retracto a productos personalizados o que por su naturaleza no puedan ser
            devueltos por razones de higiene, una vez hayan sido desprecintados.
          </p>
        </section>

        <p className="border-t border-border pt-6 text-xs italic">
          Este texto es una plantilla base y debe revisarse con un asesor legal antes de operar comercialmente.
        </p>
      </div>
    </div>
  );
}
