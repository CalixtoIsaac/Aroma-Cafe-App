// Conexión a MySQL (base AROMA_CAFE_db) usando un pool de conexiones.
import "dotenv/config";
import mysql from "mysql2/promise";
import crypto from "node:crypto";

export const config = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "AROMA_CAFE_db",
};

export const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 15,
  dateStrings: true, // las fechas llegan como texto "YYYY-MM-DD HH:MM:SS" (sin conversiones de zona horaria)
  decimalNumbers: true, // DECIMAL → number
  charset: "utf8mb4",
});

/** Ejecuta una consulta y devuelve las filas. */
export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Ejecuta varias operaciones dentro de una transacción. */
export async function transaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Mismo cálculo que fn_hash_password en MySQL: SHA-256(sal + contraseña). */
export function hashPassword(password, salt) {
  return crypto
    .createHash("sha256")
    .update(salt + password, "utf8")
    .digest("hex");
}

export function nuevaSal() {
  return crypto.randomBytes(8).toString("hex");
}
