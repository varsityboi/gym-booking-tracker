import { z } from "zod";

// Checks req.body against the schema; on failure 400 { error } with the first
// issue's message. With { itemIndex: true } (for bodies with an `items`
// array), an issue inside one item also gives that item's index, so the
// client can show the error on the right item: { error, itemIndex }.
export function validate(schema, { itemIndex = false } = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const body = { error: issue.message };
      if (itemIndex && issue.path[0] === "items" && Number.isInteger(issue.path[1])) {
        body.itemIndex = issue.path[1];
      }
      return res.status(400).json(body);
    }
    req.body = result.data;
    next();
  };
}

// Like validate, for the query string. Express 5's req.query can't be
// reassigned, so the parsed result goes in req.validatedQuery.
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }
    req.validatedQuery = result.data;
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

// One item added to an existing meal: same rules as an item in createMealSchema.
export const addMealItemSchema = mealItemSchema;

// GET /meals?date=YYYY-MM-DD (India date); no date means today.
export const mealsDayQuerySchema = z.object({
  date: z
    .string({ message: "date must be YYYY-MM-DD" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .refine((d) => {
      const parsed = new Date(`${d}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
    }, "date must be a real date")
    .optional(),
});

const versionSchema = z
  .number({ message: "version is required" })
  .int("version must be a whole number")
  .positive("version must be a whole number");

const ESTIMATE_FIELDS = ["name", "caloriesPer100g", "proteinPer100g", "fatPer100g", "carbsPer100g"];

// PATCH an item: version plus any of grams, foodId (switch to a table food),
// or all five estimate fields (switch to, or edit, an estimate).
export const editMealItemSchema = z
  .object({
    version: versionSchema,
    grams: gramsSchema.optional(),
    foodId: tableItemSchema.shape.foodId.optional(),
    name: estimatedItemSchema.shape.name.optional(),
    caloriesPer100g: per100g("caloriesPer100g", 900).optional(),
    proteinPer100g: per100g("proteinPer100g", 100).optional(),
    fatPer100g: per100g("fatPer100g", 100).optional(),
    carbsPer100g: per100g("carbsPer100g", 100).optional(),
  })
  .superRefine((body, ctx) => {
    const given = ESTIMATE_FIELDS.filter((f) => body[f] !== undefined);
    if (given.length > 0 && given.length < ESTIMATE_FIELDS.length) {
      ctx.addIssue({
        code: "custom",
        message: "an estimate needs name, caloriesPer100g, proteinPer100g, fatPer100g and carbsPer100g",
      });
    }
    if (given.length > 0 && body.foodId !== undefined) {
      ctx.addIssue({ code: "custom", message: "send either foodId or an estimate, not both" });
    }
    if (body.grams === undefined && body.foodId === undefined && given.length === 0) {
      ctx.addIssue({ code: "custom", message: "nothing to change: send grams, foodId or an estimate" });
    }
    if (
      given.length === ESTIMATE_FIELDS.length &&
      body.proteinPer100g + body.fatPer100g + body.carbsPer100g > 100
    ) {
      ctx.addIssue({
        code: "custom",
        message: "protein + fat + carbs can't be more than 100 g per 100 g",
      });
    }
  });

export const removeMealItemSchema = z.object({ version: versionSchema });

// GET /admin/classes?from=&to=. Each is an ISO date (YYYY-MM-DD, a gym-local
// day in India time) or an ISO date-time with a time zone (Z or +05:30).
// `from` is the start of its day; a date-only `to` includes that whole day.
// Defaults: from = now, to = from + 30 days. The range must be positive and
// at most 90 days. Parses to { from: Date, to: Date }, to exclusive.
const DAY_MS = 24 * 60 * 60 * 1000;
export const ADMIN_CLASSES_DEFAULT_DAYS = 30;
export const ADMIN_CLASSES_MAX_DAYS = 90;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const realDate = (d) => {
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
};

const instantSchema = (field, { wholeDay = false } = {}) =>
  z.string({ message: `${field} must be an ISO date or date-time` }).transform((s, ctx) => {
    const message = `${field} must be an ISO date (YYYY-MM-DD) or date-time with a time zone`;
    if (DATE_ONLY.test(s) && realDate(s)) {
      const start = new Date(`${s}T00:00:00+05:30`);
      return wholeDay ? new Date(start.getTime() + DAY_MS) : start;
    }
    const m = s.match(DATE_TIME);
    const t = m && realDate(m[1]) ? new Date(s) : null;
    if (!t || Number.isNaN(t.getTime())) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return t;
  });

export const adminClassesQuerySchema = z
  .object({
    from: instantSchema("from").optional(),
    to: instantSchema("to", { wholeDay: true }).optional(),
  })
  .transform(({ from, to }, ctx) => {
    const start = from ?? new Date();
    const end = to ?? new Date(start.getTime() + ADMIN_CLASSES_DEFAULT_DAYS * DAY_MS);
    if (end <= start) {
      ctx.addIssue({ code: "custom", message: "to must be after from" });
      return z.NEVER;
    }
    if (end - start > ADMIN_CLASSES_MAX_DAYS * DAY_MS) {
      ctx.addIssue({ code: "custom", message: `the range can be at most ${ADMIN_CLASSES_MAX_DAYS} days` });
      return z.NEVER;
    }
    return { from: start, to: end };
  });
