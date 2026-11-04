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