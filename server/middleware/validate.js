import { z } from "zod";

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }
    req.body = result.data;
    next();
  };
}

export const signupSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  email: z.string().trim().toLowerCase().email("invalid email"),
  password: z.string().min(8, "password must be at least 8 characters").max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("invalid email"),
  password: z.string().min(1, "password is required"),
});

export const createClassSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(100),
  startsAt: z.coerce
    .date({ message: "startsAt must be a valid date" })
    .refine((d) => d > new Date(), "class must start in the future"),
  capacity: z
    .number({ message: "capacity must be a number" })
    .int("capacity must be a whole number")
    .min(1, "capacity must be from 1 to 200")
    .max(200, "capacity must be from 1 to 200"),
});

export const cancelClassSchema = z.object({
  reason: z
    .string({ message: "reason must be text" })
    .trim()
    .min(1, "reason must be 1 to 200 characters")
    .max(200, "reason must be 1 to 200 characters")
    .optional(),
});

export const updateCapacitySchema = z.object({
  capacity: z
    .number({ message: "capacity must be a number" })
    .int("capacity must be a whole number")
    .min(1, "capacity must be from 1 to 200")
    .max(200, "capacity must be from 1 to 200"),
});
const gramsSchema = z
  .number({ message: "grams must be a number" })
  .positive("grams must be more than 0")
  .max(5000, "grams too large");

const per100g = (field, max) =>
  z
    .number({ message: `${field} must be a number` })
    .min(0, `${field} must be from 0 to ${max}`)
    .max(max, `${field} must be from 0 to ${max}`);

// A food from the foods table.
const tableItemSchema = z.object({
  foodId: z.number({ message: "invalid foodId" }).int("invalid foodId").positive("invalid foodId"),
  grams: gramsSchema,
});

// An AI-estimated food that isn't in the table, with nutrition per 100 g.
const estimatedItemSchema = z
  .object({
    name: z.string({ message: "name is required" }).trim().min(1, "name is required").max(100, "name too long"),
    grams: gramsSchema,
    caloriesPer100g: per100g("caloriesPer100g", 900),
    proteinPer100g: per100g("proteinPer100g", 100),
    fatPer100g: per100g("fatPer100g", 100),
    carbsPer100g: per100g("carbsPer100g", 100),
  })
  .refine(
    (i) => i.proteinPer100g + i.fatPer100g + i.carbsPer100g <= 100,
    "protein + fat + carbs can't be more than 100 g per 100 g"
  );

// Items with a foodId are table items, everything else is an estimate. Picking
// the schema up front (instead of z.union) gives a specific error message.
const mealItemSchema = z.unknown().transform((item, ctx) => {
  const isTableItem = item !== null && typeof item === "object" && "foodId" in item;
  const result = (isTableItem ? tableItemSchema : estimatedItemSchema).safeParse(item);
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue(issue);
    return z.NEVER;
  }
  return isTableItem ? { kind: "table", ...result.data } : { kind: "estimated", ...result.data };
});

export const createMealSchema = z.object({
  eatenAt: z.coerce
    .date({ message: "eatenAt must be a valid date" })
    .refine((d) => d <= new Date(), "eatenAt can't be in the future")
    .optional(),
  items: z
    .array(mealItemSchema)
    .min(1, "a meal needs at least one food")
    .max(30, "too many items in one meal"),
});
export const waterSchema = z.object({
  ml: z
    .number({ message: "ml must be a number" })
    .int("ml must be a whole number")
    .min(1, "ml must be from 1 to 2000")
    .max(2000, "ml must be from 1 to 2000")
    .default(250),
});
export const targetsSchema = z.object({
  calories: z.number().int().min(500, "calories must be from 500 to 6000").max(6000, "calories must be from 500 to 6000"),
  proteinG: z.number().int().min(0).max(500, "protein must be at most 500g"),
  fatG: z.number().int().min(0).max(500, "fat must be at most 500g"),
  carbsG: z.number().int().min(0).max(1000, "carbs must be at most 1000g"),
  waterMl: z.number().int().min(250, "water must be from 250 to 8000 ml").max(8000, "water must be from 250 to 8000 ml"),
});