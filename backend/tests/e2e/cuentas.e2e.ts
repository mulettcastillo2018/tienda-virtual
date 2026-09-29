import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { escapeHtml } from "../../src/services/email.service";
import { findOrCreateOAuthUser, issueLoginCode, OAuthLoginError } from "../../src/services/oauth.service";
import { API_URL, CLAVE_PRUEBA, crearAdmin, crearCliente, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Seguridad de las cuentas: sesiones revocables, límites de intentos, inicio
// de sesión social y cabeceras.
export async function probarCuentas() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const admin = await crearAdmin(creados);
    const me = (token: string) => req("GET", "/auth/me", undefined, token);
    const login = (email: string, password = CLAVE_PRUEBA) => req("POST", "/auth/login", { email, password });

    console.log("[cuentas] Registro");
    const correo = `Cuentas_E2E_${Date.now()}@Tienda.TEST`;
    const registro = await req("POST", "/auth/register", { email: correo, phone: "3001234567", password: CLAVE_PRUEBA });
    if (registro.data?.user?.id) creados.usuarios.push(registro.data.user.id);
    verificar(registro.status === 201 && registro.data.user.email === correo.toLowerCase(), "el correo se guarda en minúsculas");
    verificar((await login(correo.toUpperCase())).status === 200, "y se puede ingresar escribiéndolo con mayúsculas");

    console.log("\n[cuentas] Límite de intentos de contraseña");
    const victima = await crearCliente(creados, "fuerza_e2e");
    let codigos = "";
    for (let i = 0; i < 8; i++) codigos += `${(await login(victima.email, "incorrecta")).status},`;
    verificar(codigos === "401,".repeat(8), "8 contraseñas equivocadas → 401");
    const bloqueado = await login(victima.email);
    verificar(bloqueado.status === 429, `al noveno intento se bloquea aunque la contraseña sea la correcta (${bloqueado.status})`);
    const tercero = await crearCliente(creados, "tercero_e2e");
    verificar((await login(tercero.email)).status === 200, "el bloqueo es de esa cuenta, no de las demás");

    console.log("\n[cuentas] Desactivar y cambiar el rol cierran la sesión al instante");
    const cliente = await crearCliente(creados, "sesion_e2e");
    verificar((await me(cliente.token)).status === 200, "sesión abierta");
    exigir(await req("PUT", `/users/${cliente.id}/active`, { isActive: false }, admin.token), "Desactivar");
    const desactivado = await me(cliente.token);
    verificar(desactivado.status === 401 && /desactivada/.test(desactivado.data?.error), "desactivado: su token deja de servir de inmediato");
    exigir(await req("PUT", `/users/${cliente.id}/active`, { isActive: true }, admin.token), "Reactivar");
    verificar((await me(cliente.token)).status === 401, "reactivarlo no revive el token viejo");
    const nuevo = exigir(await login(cliente.email), "Login otra vez").token as string;
    exigir(await req("PUT", `/users/${cliente.id}/role`, { role: "JURIDICO" }, admin.token), "Cambiar rol");
    const conOtroRol = await me(nuevo);
    verificar(conOtroRol.status === 401 && /permisos|sesión/.test(conOtroRol.data?.error), "con otro rol, el token anterior deja de servir");
    exigir(await req("PUT", `/users/${cliente.id}/role`, { role: "CUSTOMER" }, admin.token), "Devolver rol");

    console.log("\n[cuentas] Cambiar la contraseña cierra las demás sesiones");
    const t1 = exigir(await login(cliente.email), "Sesión 1").token as string;
    const t2 = exigir(await login(cliente.email), "Sesión 2").token as string;
    const cambio = await req("PUT", "/auth/password", { currentPassword: CLAVE_PRUEBA, newPassword: "otra-clave-e2e" }, t1);
    verificar(cambio.status === 200 && typeof cambio.data?.token === "string", "cambia la contraseña y recibe un token nuevo");
    verificar((await me(t2)).status === 401 && (await me(t1)).status === 401, "las sesiones anteriores (incluida la del otro dispositivo) se cierran");
    verificar((await me(cambio.data.token)).status === 200, "la sesión actual sigue con el token nuevo");
    verificar((await login(cliente.email, "otra-clave-e2e")).status === 200, "la contraseña nueva funciona");

    console.log("\n[cuentas] Restablecer por correo y por el administrador");
    const antes = exigir(await login(cliente.email, "otra-clave-e2e"), "Login").token as string;
    const enlace = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: cliente.id, tokenHash: crypto.createHash("sha256").update(enlace).digest("hex"), expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    verificar((await req("POST", "/auth/reset-password", { token: enlace, newPassword: CLAVE_PRUEBA })).status === 200, "el enlace del correo restablece la contraseña");
    verificar((await me(antes)).status === 401, "y cierra las sesiones abiertas");
    verificar((await req("POST", "/auth/reset-password", { token: enlace, newPassword: "tercera-clave-e2e" })).status === 400, "el enlace no sirve dos veces");
    const antesDelAdmin = exigir(await login(cliente.email), "Login").token as string;
    exigir(await req("PUT", `/users/${cliente.id}/password`, { newPassword: "clave-del-admin-e2e" }, admin.token), "Admin restablece");
    verificar((await me(antesDelAdmin)).status === 401, "si el administrador le pone una contraseña nueva, también se cierran sus sesiones");

    console.log("\n[cuentas] Tokens manipulados");
    const [cabecera, cuerpo] = cliente.token.split(".");
    const sinFirma = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${cuerpo}.`;
    verificar((await me(sinFirma)).status === 401, "un token sin firma (alg: none) se rechaza");
    const comoAdmin = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, "base64url").toString()), role: "ADMIN" })).toString("base64url");
    verificar((await req("GET", "/users", undefined, `${cabecera}.${comoAdmin}.firma`)).status === 401, "cambiarse el rol dentro del token no sirve");

    console.log("\n[cuentas] Inicio de sesión con Google/Facebook");
    let rechazado = false;
    try {
      await findOrCreateOAuthUser("google", `e2e-${Date.now()}`, cliente.email.toUpperCase());
    } catch (err) {
      rechazado = err instanceof OAuthLoginError;
    }
    verificar(rechazado, "una cuenta de Google con el correo de una cuenta existente no entra a ella");
    const social = await findOrCreateOAuthUser("google", `e2e-sub-${Date.now()}`, `social_${Date.now()}@tienda.test`);
    creados.usuarios.push(social.id);
    verificar(social.provider === "google" && (await findOrCreateOAuthUser("google", social.providerId!, "otro@tienda.test")).id === social.id, "un correo nuevo crea la cuenta y la próxima vez la reconoce");
    const codigo = await issueLoginCode(social.id);
    const canje = await req("POST", "/auth/oauth/exchange", { code: codigo });
    verificar(canje.status === 200 && (await me(canje.data.token)).status === 200, "el navegador canjea el código por la sesión");
    verificar((await req("POST", "/auth/oauth/exchange", { code: codigo })).status === 400, "el código no sirve dos veces");
    const vencido = await issueLoginCode(social.id);
    await prisma.oAuthLoginCode.updateMany({ where: { codeHash: crypto.createHash("sha256").update(vencido).digest("hex") }, data: { expiresAt: new Date(Date.now() - 1000) } });
    verificar((await req("POST", "/auth/oauth/exchange", { code: vencido })).status === 400, "ni después de vencido");
    const vuelta = await fetch(`${API_URL}/auth/google/callback?code=robado&state=inventado`, { redirect: "manual" });
    const destino = vuelta.headers.get("location") ?? "";
    verificar(vuelta.status === 302 && destino.includes("/login?oauthError=") && !destino.includes("code="), "volver de Google sin el state correcto no inicia sesión");

    console.log("\n[cuentas] Correos y cabeceras");
    verificar(escapeHtml(`<a href="https://x.co">'hola' & más</a>`) === "&lt;a href=&quot;https://x.co&quot;&gt;&#39;hola&#39; &amp; más&lt;/a&gt;", "el contenido de los correos se escapa");
    const salud = await fetch(`${API_URL}/health`);
    verificar(salud.headers.get("x-content-type-options") === "nosniff" && salud.headers.get("x-frame-options") === "DENY" && !salud.headers.get("x-powered-by"), "la API envía cabeceras de seguridad y no dice qué servidor usa");
    const imagen = fs.readdirSync(path.join(__dirname, "../../uploads/products")).find((f) => !f.startsWith("."));
    if (imagen) {
      const archivo = await fetch(`${API_URL}/uploads/products/${imagen}`);
      verificar(archivo.status === 200 && archivo.headers.get("content-security-policy")?.includes("sandbox"), "los archivos subidos se sirven como contenido inerte (sandbox)");
    }
  } finally {
    await limpiar(creados);
  }
}
