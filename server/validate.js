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

export const updateCapacitySchema = z.object({
  capacity: z
    .number({ message: "capacity must be a number" })
    .int("capacity must be a whole number")
    .min(1, "capacity must be from 1 to 200")
    .max(200, "capacity must be from 1 to 200"),
});
export const createMealSchema = z.object({
  eatenAt: z.coerce
    .date({ message: "eatenAt must be a valid date" })
    .refine((d) => d <= new Date(), "eatenAt can't be in the future")
    .optional(),
  items: z
    .array(
      z.object({
        foodId: z.number().int().positive("invalid foodId"),
        grams: z.number().positive("grams must be more than 0").max(5000, "grams too large"),
      })
    )
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