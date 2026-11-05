import pool from "../config/db.js";

// Throws the pg error as is (23505 when the email is taken).
export async function createUser(name, email, passwordHash) {
  const result = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role",
    [name, email, passwordHash]
  );
  return result.rows[0];
}

export async function findByEmailWithPassword(email) {
  const result = await pool.query(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
}

export async function findById(id) {
  const result = await pool.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0];
}
