import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

/** Tarjeta centrada de las pantallas de acceso (ingresar, registrarse, contraseña). */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <div className="relative isolate mx-auto max-w-md overflow-hidden rounded-[2rem] border border-border bg-surface p-6 shadow-elevada sm:p-10">
        <div aria-hidden className="absolute -top-28 -right-24 -z-10 size-72 rounded-full bg-accent/10 blur-3xl" />
        <p className="brand-gradient-text text-center text-lg font-extrabold tracking-tight">Tienda Virtual</p>
        <h1 className="mt-4 text-center text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-center text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
    </Container>
  );
}
