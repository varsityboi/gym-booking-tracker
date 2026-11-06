import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

// Loads data/INDB.xlsx ("Nutrient Data" sheet) into foods, one upsert per
// row (an existing name gets the new values). `db` is a pg Pool or Client.
// Returns how many rows were loaded. Used by npm run db:foods and db:seed.
export async function importFoods(db) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileURLToPath(new URL("../../data/INDB.xlsx", import.meta.url)));
  const sheet = workbook.getWorksheet("Nutrient Data");

  const header = sheet.getRow(1).values;
  const col = (name) => header.indexOf(name);
  const cols = {
    name: col("food_name"),
    kcal: col("energy_kcal"),
    protein: col("protein_g"),
    fat: col("fat_g"),
    carbs: col("carb_g"),
  };

  let count = 0;
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const name = row.getCell(cols.name).value;
    if (!name) continue;

    await db.query(
      `INSERT INTO foods (name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         calories_per_100g = EXCLUDED.calories_per_100g,
         protein_per_100g = EXCLUDED.protein_per_100g,
         fat_per_100g = EXCLUDED.fat_per_100g,
         carbs_per_100g = EXCLUDED.carbs_per_100g`,
      [
        String(name).trim(),
        row.getCell(cols.kcal).value,
        row.getCell(cols.protein).value,
        row.getCell(cols.fat).value,
        row.getCell(cols.carbs).value,
      ]
    );
    count++;
  }
  return count;
}
