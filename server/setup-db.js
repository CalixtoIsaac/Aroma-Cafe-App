// Ejecuta los scripts SQL de la carpeta db/ contra MySQL (entiende DELIMITER).
//   npm run db:setup  → aplica 02, 03 y 04 (conserva tus datos)
//   npm run db:reset  → recrea todo: 01 a 04 (⚠ borra la base y la vuelve a crear)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

import { config } from "./db.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db");
const reset = process.argv.includes("--reset");
const archivos = [
  ...(reset ? ["01_AvanceProyecto_1.sql"] : []),
  "02_ampliacion_app.sql",
  "03_menu_cafeteria.sql",
  "04_empleados_seguridad.sql",
];

const sinComentarios = (s) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim();

function separar(sql) {
  const sentencias = [];
  let delim = ";";
  let actual = "";
  for (const linea of sql.split(/\r?\n/)) {
    const m = linea.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) {
      delim = m[1];
      continue;
    }
    actual += linea + "\n";
    const codigo = linea.replace(/\s--\s.*$/, "").trimEnd(); // ignora comentarios al final de la línea
    if (codigo.endsWith(delim)) {
      const s = actual.slice(0, actual.lastIndexOf(delim)).trim();
      if (sinComentarios(s)) sentencias.push(s);
      actual = "";
    }
  }
  if (actual.trim()) sentencias.push(actual.trim());
  return sentencias;
}

const { database: _db, ...sinBase } = config;
const cx = await mysql.createConnection({ ...sinBase, charset: "utf8mb4" });
if (!reset) {
  const [r] = await cx.query("SHOW DATABASES LIKE ?", [config.database]);
  if (!r.length) {
    console.error(
      `La base ${config.database} no existe. Usa "npm run db:reset" para crearla desde cero.`,
    );
    process.exit(1);
  }
}
for (const f of archivos) {
  const sentencias = separar(fs.readFileSync(path.join(dir, f), "utf8"));
  process.stdout.write(`→ ${f} (${sentencias.length} sentencias)… `);
  for (const s of sentencias) {
    const limpio = sinComentarios(s);
    if (/^SELECT\b/i.test(limpio) && !/\bINTO\b/i.test(limpio)) continue; // omite consultas de verificación
    if (/^CALL\s+sp_prueba/i.test(limpio)) continue;
    try {
      await cx.query(s);
    } catch (e) {
      console.error(`\n✘ Error en:\n${s.slice(0, 300)}\n→ ${e.message}`);
      process.exit(1);
    }
  }
  console.log("listo ✔");
}
await cx.end();
console.log(`\nBase ${config.database} preparada.`);
