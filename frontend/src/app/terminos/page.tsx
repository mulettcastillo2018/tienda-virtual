"use client";

import { useLocale } from "@/lib/i18n";

export default function TerminosPage() {
  const locale = useLocale();

  if (locale === "en") {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
        <h1 className="px-1 text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Terms and Conditions</h1>
        <p className="mt-3 px-1 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-8 space-y-8 rounded-[2rem] border border-border bg-surface p-6 text-[15px] leading-relaxed text-muted-foreground shadow-suave sm:p-10">
          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">1. Acceptance of terms</h2>
            <p className="mt-2">
              By registering or making a purchase at Tienda Virtual you accept these terms and conditions. If you
              disagree with any of them, please don't use the site.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">2. Purpose</h2>
            <p className="mt-2">
              Tienda Virtual is an e-commerce platform that allows the purchase of physical products with
              nationwide delivery in Colombia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">3. User account</h2>
            <p className="mt-2">
              You can buy with an account or as a guest, with just your email (we send you a link to follow your
              order). If you create an account, you're responsible for keeping your credentials confidential and for
              any activity carried out from it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">4. Prices and payments</h2>
            <p className="mt-2">
              All prices are shown in Colombian pesos (COP) and include VAT unless stated otherwise. Online payments
              are processed through the Wompi gateway; Tienda Virtual does not store your card data. In some cities
              you can also pay cash on delivery. Every sale gets an electronic invoice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">5. Purchase process</h2>
            <p className="mt-2">
              An order paid online is confirmed when the gateway approves the payment; a cash on delivery order,
              when we confirm it with you. Before paying you see the shipping cost and the total. Products are
              subject to inventory availability at the time of purchase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">6. Intellectual property</h2>
            <p className="mt-2">
              The site's content (brand, text, images, design) is the property of Tienda Virtual or its licensors
              and may not be reproduced without authorization.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">7. Changes</h2>
            <p className="mt-2">We may update these terms at any time. Changes apply from the moment they're published on this page.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">8. Governing law</h2>
            <p className="mt-2">
              These terms are governed by the laws of the Republic of Colombia, including the Consumer Statute
              (Law 1480 of 2011).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold tracking-tight text-foreground">9. Contact</h2>
            <p className="mt-2">For questions about these terms, reach out through the contact channels listed on the site.</p>
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
      <h1 className="px-1 text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Términos y condiciones</h1>
      <p className="mt-3 px-1 text-sm text-muted-foreground">Última actualización: {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-8 rounded-[2rem] border border-border bg-surface p-6 text-[15px] leading-relaxed text-muted-foreground shadow-suave sm:p-10">
        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">1. Aceptación de los términos</h2>
          <p className="mt-2">
            Al registrarte o realizar una compra en Tienda Virtual aceptas los presentes términos y condiciones.
            Si no estás de acuerdo con alguno de ellos, te pedimos no usar el sitio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">2. Objeto</h2>
          <p className="mt-2">
            Tienda Virtual es una plataforma de comercio electrónico que permite la compra de productos físicos
            con entrega a nivel nacional en Colombia.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">3. Cuenta de usuario</h2>
          <p className="mt-2">
            Puedes comprar con una cuenta o como invitado, solo con tu correo (te enviamos un enlace para seguir tu
            pedido). Si creas una cuenta, eres responsable de la confidencialidad de tus credenciales y de toda
            actividad realizada desde ella.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">4. Precios y pagos</h2>
          <p className="mt-2">
            Todos los precios se muestran en pesos colombianos (COP) e incluyen el IVA, salvo que se indique lo
            contrario. Los pagos en línea se procesan a través de la pasarela Wompi; Tienda Virtual no almacena los
            datos de tu tarjeta. En algunas ciudades también puedes pagar contra entrega. Cada venta lleva factura
            electrónica.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">5. Proceso de compra</h2>
          <p className="mt-2">
            Un pedido con pago en línea se confirma cuando la pasarela aprueba el pago; uno contra entrega, cuando
            lo confirmamos contigo. Antes de pagar ves el costo del envío y el total. Los productos están sujetos a
            disponibilidad de inventario al momento de la compra.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">6. Propiedad intelectual</h2>
          <p className="mt-2">
            El contenido del sitio (marca, textos, imágenes, diseño) es propiedad de Tienda Virtual o de sus
            licenciantes y no puede reproducirse sin autorización.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">7. Modificaciones</h2>
          <p className="mt-2">
            Podemos actualizar estos términos en cualquier momento. Los cambios aplican desde su publicación en
            esta página.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">8. Ley aplicable</h2>
          <p className="mt-2">
            Estos términos se rigen por las leyes de la República de Colombia, incluyendo el Estatuto del
            Consumidor (Ley 1480 de 2011).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold tracking-tight text-foreground">9. Contacto</h2>
          <p className="mt-2">
            Para dudas sobre estos términos, escríbenos a través de los canales de contacto indicados en el sitio.
          </p>
        </section>

        <p className="border-t border-border pt-6 text-xs italic">
          Este texto es una plantilla base y debe revisarse con un asesor legal antes de operar comercialmente.
        </p>
      </div>
    </div>
  );
}
