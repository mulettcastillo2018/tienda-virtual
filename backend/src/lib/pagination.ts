import { z } from "zod";

// Parámetros de página de los listados del panel (?page=&pageSize=), con
// el mismo tope que el catálogo.
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export function pageArgs({ page, pageSize }: { page: number; pageSize: number }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
