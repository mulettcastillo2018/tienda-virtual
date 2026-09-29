"use client";

import { useLocale } from "@/lib/i18n";

export default function EnviosPage() {
  const locale = useLocale();

  if (locale === "en") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Shipping Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-bold text-foreground">Coverage</h2>
            <p className="mt-2">We ship throughout Colombia.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">Carriers</h2>
            <p className="mt-2">
              We work with <strong>Envía</strong> for major cities (Bogotá, Medellín, Cali, Barranquilla, Cartagena,
              Bucaramanga, Manizales) and with <strong>Interrapidísimo</strong> for the rest of the country. The
              carrier is assigned automatically based on your delivery address.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">Shipping costs</h2>
            <p className="mt-2">The cost is calculated automatically at checkout based on destination and order weight:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Base rate: $10,000 COP in major cities, $18,000 COP in other areas.</li>
              <li>Surcharge of $1,500 COP for each additional kilo beyond the first 2 kg of the order.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">Estimated delivery times</h2>
            <p className="mt-2">
              2 to 4 business days in major cities and 4 to 7 business days in the rest of the country, counted
              from payment confirmation. These times are estimates and may vary depending on the carrier and
              external conditions (weather, road availability, etc.).
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">Order tracking</h2>
            <p className="mt-2">
              Once your order is dispatched, we'll send you an email with the carrier and tracking number so you
              can follow it. You can also check the status of your orders from{" "}
              <a href="/account" className="text-accent underline">
                your account
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">Hasn't your order arrived?</h2>
            <p className="mt-2">
              If the estimated time has passed and you haven't received your order, contact us with your tracking
              number so we can help you follow up with the carrier.
            </p>
          </section>

          <p className="border-t border-border pt-4 text-xs italic">
            This text is a base template and should be reviewed before operating commercially.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Política de envíos</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-bold text-foreground">Cobertura</h2>
          <p className="mt-2">Hacemos envíos a todo el territorio nacional de Colombia.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground">Transportadoras</h2>
          <p className="mt-2">
            Trabajamos con <strong>Envía</strong> para las principales ciudades (Bogotá, Medellín, Cali,
            Barranquilla, Cartagena, Bucaramanga, Manizales) y con <strong>Interrapidísimo</strong> para el resto
            del país. La transportadora se asigna automáticamente según tu dirección de entrega.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground">Costos de envío</h2>
          <p className="mt-2">El costo se calcula automáticamente en el checkout según destino y peso del pedido:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Tarifa base: $10.000 COP en ciudades principales, $18.000 COP en el resto de zonas.</li>
            <li>Recargo de $1.500 COP por cada kilo adicional que supere los primeros 2 kg del pedido.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground">Tiempos estimados de entrega</h2>
          <p className="mt-2">
            2 a 4 días hábiles en ciudades principales y 4 a 7 días hábiles en el resto del país, contados desde
            la confirmación del pago. Estos tiempos son estimados y pueden variar según la transportadora y
            condiciones externas (clima, disponibilidad de vías, etc.).
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground">Seguimiento del pedido</h2>
          <p className="mt-2">
            Cuando tu pedido sea despachado, te enviaremos un correo con la transportadora y el número de guía
            para que puedas hacerle seguimiento. También puedes consultar el estado de tus pedidos desde{" "}
            <a href="/account" className="text-accent underline">
              tu cuenta
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground">¿Tu pedido no ha llegado?</h2>
          <p className="mt-2">
            Si el tiempo estimado ya pasó y no has recibido tu pedido, contáctanos con tu número de guía para
            ayudarte a hacer seguimiento con la transportadora.
          </p>
        </section>

        <p className="border-t border-border pt-4 text-xs italic">
          Este texto es una plantilla base y debe revisarse antes de operar comercialmente.
        </p>
      </div>
    </div>
  );
}
