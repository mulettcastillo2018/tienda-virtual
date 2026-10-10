import type { MouseEvent } from "react";

const MAX_PX = 5;

/**
 * Efecto magnético para los botones de compra: el botón se desplaza unos
 * píxeles hacia el cursor y vuelve a su sitio al salir. Es solo visual (no
 * usa estado) y se omite si la persona pidió reducir el movimiento.
 * Uso: <button {...magnetic} />
 */
export const magnetic = {
  onMouseMove(event: MouseEvent<HTMLElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2 * MAX_PX;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2 * MAX_PX;
    el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  },
  onMouseLeave(event: MouseEvent<HTMLElement>) {
    event.currentTarget.style.translate = "";
  },
};
