import pool from "./db.js";

export async function searchFoods(q, limit = 10) {
  const result = await pool.query(
    `SELECT id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
            word_similarity($1, name) AS score
     FROM foods
     WHERE $1 <% name OR name ILIKE '%' || $1 || '%'
     ORDER BY score DESC
     LIMIT $2`,
    [q, limit]
  );
  return result.rows;
}