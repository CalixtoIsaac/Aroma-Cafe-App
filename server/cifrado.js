// Cifrado reversible (AES-256-GCM) para las contraseñas de EMPLEADOS.
// ---------------------------------------------------------------------------
// Las contraseñas se verifican siempre contra el hash SHA-256 + sal de la
// tabla usuarios. Además, solo para cocina y repartidores, se guarda una copia
// cifrada para que el administrador pueda consultarla. La llave (APP_SECRET)
// vive en el archivo .env del servidor, nunca en la base de datos: quien
// obtenga una copia de la base no puede leer esas contraseñas.
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Si no hay APP_SECRET en .env, genera una y la guarda (una sola vez). */
function obtenerSecreto() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) return process.env.APP_SECRET;
  const secreto = crypto.randomBytes(32).toString("hex");
  const archivo = path.join(RAIZ, ".env");
  try {
    const actual = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf8") : "";
    const linea = `\n# Llave para cifrar las contraseñas de empleados (no la compartas ni la cambies)\nAPP_SECRET=${secreto}\n`;
    fs.writeFileSync(archivo, actual.replace(/\s*$/, "") + "\n" + linea);
    console.log("  🔑 Se generó APP_SECRET y se guardó en .env");
  } catch {
    console.warn(
      "  ⚠ No se pudo escribir APP_SECRET en .env; las contraseñas de empleados no se podrán consultar tras reiniciar.",
    );
  }
  process.env.APP_SECRET = secreto;
  return secreto;
}

const llave = crypto.createHash("sha256").update(obtenerSecreto()).digest();

/** Texto → "iv.tag.cifrado" en base64 */
export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", llave, iv);
  const datos = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}

/** "iv.tag.cifrado" → texto, o null si no se puede descifrar (llave distinta o dato alterado) */
export function descifrar(valor) {
  try {
    const [iv, tag, datos] = String(valor)
      .split(".")
      .map((p) => Buffer.from(p, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", llave, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
