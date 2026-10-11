"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import type { ContactInfo } from "@/lib/types";

// Versión de la política: la misma que acepta el cliente (backend: PRIVACY_POLICY_VERSION).
const VERSION = "2026-10-12";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

// Política de tratamiento de datos personales (Ley 1581 de 2012, Decreto 1377 de 2013).
export default function PrivacidadPage() {
  const locale = useLocale();
  const [info, setInfo] = useState<ContactInfo | null>(null);

  useEffect(() => {
    apiFetch<ContactInfo>("/contact-info")
      .then(setInfo)
      .catch(() => {});
  }, []);

  const responsable = info ? (
    <p>
      <strong className="text-foreground">{info.legalName || "Tienda Virtual"}</strong>
      {info.nit ? ` · NIT ${info.nit}` : ""} · {info.address} · {info.email} · {info.phone}
    </p>
  ) : null;

  const en = locale === "en";
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <h1 className="px-1 text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">
        {en ? "Personal Data Processing Policy" : "Política de tratamiento de datos personales"}
      </h1>
      <p className="mt-3 px-1 text-sm text-muted-foreground">{en ? `Version ${VERSION}` : `Versión ${VERSION}`}</p>
      <p className="mt-4 rounded-2xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
        {en
          ? "Reference text for a demo store: it must be reviewed by a lawyer before using it with real customers."
          : "Texto de referencia de una tienda de demostración: debe revisarlo un abogado antes de usarlo con clientes reales."}
      </p>

      <div className="mt-8 space-y-8 rounded-[2rem] border border-border bg-surface p-6 text-[15px] leading-relaxed text-muted-foreground shadow-suave sm:p-10">
        {en ? (
          <>
            <Section title="1. Data controller">{responsable}</Section>
            <Section title="2. Data we collect">
              <p>Identification and contact data (name, email, phone, delivery address), the ID document you give us for an invoice in your name, your orders and requests (PQRS, returns) and the attachments you upload. We never receive or store card data: payments are processed by Wompi.</p>
            </Section>
            <Section title="3. Purposes">
              <p>To manage your account and purchases, payments, shipping, electronic invoicing, warranties, returns and requests, to keep the store secure and to meet legal obligations. Only if you authorize it separately: to send you offers and news, which you can stop at any time.</p>
            </Section>
            <Section title="4. Your rights">
              <p>As the data owner you can know, update and correct your data; ask for proof of your authorization; be informed about how it is used; revoke the authorization or ask for deletion when there is no legal duty to keep it; access it free of charge; and file complaints with the Superintendence of Industry and Commerce (SIC).</p>
            </Section>
            <Section title="5. How to exercise them">
              <p>
                From <Link href="/account#privacidad" className="underline underline-offset-4">My account → Your personal data</Link> you can download your data, manage offers and delete your account. You can also write to us through a PQRS or by email. Queries are answered within 10 business days and claims within 15 business days, as the law requires.
              </p>
            </Section>
            <Section title="6. Who else processes them">
              <p>Only to fulfil the purposes above: Wompi (payments), carriers (deliveries), Alanube and the DIAN (electronic invoicing), our email provider and cloud hosting. They act on our behalf and under this policy.</p>
            </Section>
            <Section title="7. Retention and security">
              <p>We keep your data while you are our customer. Orders and invoices are kept for the time accounting and tax rules require, even if you delete your account. Access is protected by passwords, encrypted connections and private files.</p>
            </Section>
          </>
        ) : (
          <>
            <Section title="1. Responsable del tratamiento">{responsable}</Section>
            <Section title="2. Datos que tratamos">
              <p>Datos de identificación y contacto (nombre, correo, teléfono, dirección de entrega), el documento que nos des para facturar a tu nombre, tus pedidos y solicitudes (PQRS, devoluciones) y los archivos que adjuntes. Nunca recibimos ni guardamos datos de tarjetas: los pagos los procesa Wompi.</p>
            </Section>
            <Section title="3. Para qué los usamos">
              <p>Gestionar tu cuenta y tus compras, pagos, envíos, factura electrónica, garantías, devoluciones y solicitudes, mantener la tienda segura y cumplir obligaciones legales. Solo si lo autorizas aparte: enviarte ofertas y novedades, lo que puedes suspender cuando quieras.</p>
            </Section>
            <Section title="4. Tus derechos (Ley 1581 de 2012, art. 8)">
              <p>Como titular puedes conocer, actualizar y rectificar tus datos; pedir prueba de tu autorización; ser informado del uso que les damos; revocar la autorización o pedir que los suprimamos cuando no haya un deber legal de conservarlos; acceder a ellos gratis; y presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</p>
            </Section>
            <Section title="5. Cómo ejercerlos">
              <p>
                Desde <Link href="/account#privacidad" className="underline underline-offset-4">Mi cuenta → Tus datos personales</Link> puedes descargar tus datos, manejar las ofertas y eliminar tu cuenta. También puedes escribirnos por una PQRS o al correo. Respondemos las consultas en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles, como manda la ley.
              </p>
            </Section>
            <Section title="6. Quién más los trata">
              <p>Solo para cumplir lo anterior: Wompi (pagos), las transportadoras (envíos), Alanube y la DIAN (factura electrónica), nuestro proveedor de correo y el alojamiento en la nube. Actúan por cuenta nuestra y bajo esta política.</p>
            </Section>
            <Section title="7. Conservación y seguridad">
              <p>Conservamos tus datos mientras seas cliente. Los pedidos y las facturas se guardan el tiempo que exigen las normas contables y tributarias, aunque elimines tu cuenta. El acceso está protegido con contraseñas, conexiones cifradas y archivos privados.</p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
