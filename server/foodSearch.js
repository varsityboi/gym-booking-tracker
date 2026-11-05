import pool from "./db.js";

// score = how well the query matches some part of the name (word_similarity).
// full  = how well the query matches the whole name (similarity).
// Ranking by the sum favours names that match well without lots of extra words.
export async function searchFoods(q, limit = 10) {
  const result = await pool.query(
    `SELECT id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
            word_similarity($1, name) AS score,
            similarity($1, name) AS full
     FROM foods
     WHERE $1 <% name OR name ILIKE '%' || $1 || '%'
     ORDER BY word_similarity($1, name) + similarity($1, name) DESC,
              length(name) ASC,
              id
     LIMIT $2`,
    [q, limit]
  );
  return result.rows;
}
