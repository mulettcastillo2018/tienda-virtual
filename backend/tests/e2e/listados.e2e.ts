import { crearAdmin, crearCliente, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Listados del panel de a una página: usuarios y PQRS, con filtros y búsqueda.
export async function probarListados() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const cliente = await crearCliente(creados, "listados_e2e");
    const otro = await crearCliente(creados, "listados_e2e");
    const admin = await crearAdmin(creados);
    const marca = cliente.email.split("@")[0];

    console.log("[listados] Usuarios");
    verificar((await req("GET", "/users", undefined, cliente.token)).status === 403, "un cliente no ve los usuarios");
    verificar((await req("GET", "/users?pageSize=500", undefined, admin.token)).status === 400, "máximo 100 por página");
    verificar((await req("GET", "/users?role=DUENO", undefined, admin.token)).status === 400, "rol inválido → 400");
    const porCorreo = exigir(await req("GET", `/users?q=${encodeURIComponent(marca.toUpperCase())}`, undefined, admin.token), "Buscar usuario");
    verificar(porCorreo.total === 1 && porCorreo.items[0].email === cliente.email, "busca por correo sin importar mayúsculas");
    const ambos = exigir(await req("GET", "/users?q=listados_e2e&pageSize=1&page=2", undefined, admin.token), "Página 2 de usuarios");
    verificar(ambos.total === 2 && ambos.items.length === 1 && ambos.items[0].email === cliente.email, "pagina de a un usuario (los más nuevos primero)");
    const admins = exigir(await req("GET", "/users?role=ADMIN&pageSize=100", undefined, admin.token), "Filtrar administradores");
    verificar(
      admins.items.every((u: { role: string }) => u.role === "ADMIN") && admins.items.some((u: { id: string }) => u.id === admin.id),
      "filtra por rol"
    );
    verificar(!JSON.stringify(porCorreo).includes("passwordHash"), "sin el hash de la contraseña");

    console.log("\n[listados] PQRS");
    const asunto = `E2E listado ${Date.now()}`;
    exigir(await req("POST", "/pqrs", { type: "PETICION", subject: `${asunto} uno`, message: "Prueba de listado" }, cliente.token), "PQRS 1");
    exigir(await req("POST", "/pqrs", { type: "QUEJA", subject: `${asunto} dos`, message: "Prueba de listado" }, otro.token), "PQRS 2");
    verificar((await req("GET", "/pqrs", undefined, cliente.token)).status === 403, "un cliente no ve las de todos");
    const porAsunto = exigir(await req("GET", `/pqrs?q=${encodeURIComponent(asunto.toLowerCase())}`, undefined, admin.token), "Buscar PQRS");
    verificar(porAsunto.total === 2 && porAsunto.items[0].subject === `${asunto} dos`, "busca por asunto, las más nuevas primero");
    const porCorreoPqrs = exigir(await req("GET", `/pqrs?q=${encodeURIComponent(otro.email)}`, undefined, admin.token), "Buscar PQRS por correo");
    verificar(porCorreoPqrs.total === 1 && porCorreoPqrs.items[0].subject === `${asunto} dos`, "busca por el correo de quien la envió");
    const recibidas = exigir(await req("GET", `/pqrs?status=RECIBIDO&q=${encodeURIComponent(asunto)}&pageSize=1`, undefined, admin.token), "Filtrar recibidas");
    verificar(recibidas.total === 2 && recibidas.items.length === 1, "filtra por estado y pagina");
    const resueltas = exigir(await req("GET", `/pqrs?status=RESUELTO&q=${encodeURIComponent(asunto)}`, undefined, admin.token), "Filtrar resueltas");
    verificar(resueltas.total === 0, "sin resultados en otro estado");
    verificar(porAsunto.counts.ALL >= 2 && porAsunto.counts.RECIBIDO >= 2, "trae los conteos de cada pestaña");
    verificar((await req("GET", "/pqrs?status=ABIERTO", undefined, admin.token)).status === 400, "estado inválido → 400");
  } finally {
    await limpiar(creados);
  }
}
