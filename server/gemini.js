import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

// Extra tries on MODEL after the first one fails, and the wait before each.
const RETRY_DELAYS_MS = [1000];
const MAX_JITTER_MS = 250;

// Time limits for one whole call, attempts and waits included.
// - attemptTimeoutMs: per-attempt limit. @google/genai 2.32 takes `timeout_ms`
//   in the request options of interactions.create and throws
//   APIConnectionTimeoutError when it runs out (with automatic continuation it
//   bounds the whole call).
// - minAttemptMs: an attempt isn't started with less than this left.
// - fallbackReserveMs: kept back from MODEL attempts so FALLBACK_MODEL always
//   gets a real try.
const PHOTO_TIMING = {
  totalBudgetMs: 45_000,
  attemptTimeoutMs: 15_000,
  minAttemptMs: 5_000,
  fallbackReserveMs: 12_000,
};
// Text-only calls are much quicker than reading a photo.
const TEXT_TIMING = {
  totalBudgetMs: 10_000,
  attemptTimeoutMs: 5_000,
  minAttemptMs: 2_000,
  fallbackReserveMs: 4_000,
};

const PROMPT = `You are looking at a photo of a meal, most likely Indian home food.
List each separate food item on the plate.
For each item give:
- name: the common dish name in English, with the Hindi name in brackets if there is one, e.g. "Chapati/Roti", "Arhar dal (Toor dal)", "Boiled rice"
- grams: your best estimate of the weight of that item on the plate, in grams
Count multiple pieces of the same item as one entry with their total weight.
If there is no food in the photo, return an empty list.`;

const jsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
        },
        required: ["name", "grams"],
      },
    },
  },
  required: ["items"],
};

const resultSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        grams: z.number().positive().max(2000),
      })
    )
    .max(15),
});

// HTTP statuses and API error codes that mean "busy, try again later".
const RETRYABLE_STATUSES = new Set([429, 500, 503]);
const RETRYABLE_CODES = new Set([
  "service_unavailable",
  "unavailable",
  "resource_exhausted",
  "internal",
]);
// SDK error names (the classes aren't exported) for timeouts and dropped connections.
const RETRYABLE_NAMES = new Set([
  "APIConnectionTimeoutError",
  "APIConnectionError",
  "ContinuationTimeoutError",
]);

function errorCode(err) {
  const body = err?.error?.error ?? err?.error;
  const code = body?.code ?? body?.status ?? err?.code;
  return typeof code === "string" ? code.toLowerCase() : undefined;
}

export function isRetryable(err) {
  // A continuation hop that failed after earlier hops succeeded wraps the real error.
  if (err?.name === "ContinuationInterruptedError" && err.cause) {
    return isRetryable(err.cause);
  }
  if (RETRYABLE_NAMES.has(err?.name)) return true;
  if (RETRYABLE_STATUSES.has(err?.status)) return true;
  return RETRYABLE_CODES.has(errorCode(err));
}

function describeError(err) {
  return errorCode(err) ?? err?.status ?? err?.name ?? "unknown";
}

const defaultCreate = (params, options) => client.interactions.create(params, options);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks Gemini for JSON with our own retries and time budget, and returns the
// parsed JSON (not yet checked against a zod schema). `label` prefixes warnings.
async function generateJson({ label, input, schema, timing, create, sleep, now }) {
  const { totalBudgetMs, attemptTimeoutMs, minAttemptMs, fallbackReserveMs } = timing;
  const deadline = now() + totalBudgetMs;
  const timeLeft = () => deadline - now();

  const request = (model, timeoutMs) =>
    create(
      {
        model,
        input,
        response_format: { type: "text", mime_type: "application/json", schema },
      },
      // The SDK retries 5xx/429 by default (up to 4 times, waiting up to 8s each);
      // turn that off so our own retries and time budget control the timing.
      { timeout_ms: timeoutMs, retries: { strategy: "none" } }
    );

  // reserveMs is budget this step may not use, because a later step needs it.
  const plan = [
    { model: MODEL, delayMs: 0, reserveMs: fallbackReserveMs },
    ...RETRY_DELAYS_MS.map((delayMs) => ({ model: MODEL, delayMs, reserveMs: fallbackReserveMs })),
    { model: FALLBACK_MODEL, delayMs: 0, reserveMs: 0 },
  ];

  let interaction;
  let lastError;
  for (const [i, { model, delayMs, reserveMs }] of plan.entries()) {
    const available = () => timeLeft() - reserveMs;
    const outOfTime = (pendingWait) => lastError && available() - pendingWait < minAttemptMs;

    const wait = delayMs ? delayMs + Math.random() * MAX_JITTER_MS : 0;
    // Check before waiting too, so we don't sleep only to find no time is left.
    let skip = outOfTime(wait);
    if (!skip && wait) {
      await sleep(wait);
      skip = outOfTime(0);
    }
    if (skip) {
      if (reserveMs) {
        // Not enough of MODEL's share left; the reserve is for the fallback.
        console.warn(`${label}: no time for attempt ${i + 1}/${plan.length} on ${model}, skipping`);
        continue;
      }
      console.warn(`${label}: out of time budget before attempt ${i + 1}/${plan.length}`);
      throw lastError;
    }

    try {
      interaction = await request(model, Math.min(attemptTimeoutMs, available()));
      break;
    } catch (err) {
      console.warn(
        `${label}: attempt ${i + 1}/${plan.length} on ${model} failed (${describeError(err)})`
      );
      if (!isRetryable(err) || i === plan.length - 1) throw err;
      lastError = err;
    }
  }

  try {
    return JSON.parse(interaction.output_text);
  } catch {
    throw new Error("Gemini did not return valid JSON");
  }
}

export async function readPlate(
  imageBuffer,
  mimeType,
  { create = defaultCreate, sleep = defaultSleep, now = Date.now } = {}
) {
  const parsed = await generateJson({
    label: "readPlate",
    input: [
      { type: "text", text: PROMPT },
      { type: "image", data: imageBuffer.toString("base64"), mime_type: mimeType },
    ],
    schema: jsonSchema,
    timing: PHOTO_TIMING,
    create,
    sleep,
    now,
  });

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Gemini returned data in the wrong shape");
  }
  return result.data.items;
}

// ---------------------------------------------------------------------------
// pickMatches: for each detected dish, choose the candidate from our foods
// table that is the same dish, or none.

const PICK_PROMPT = `You match dish names, detected in a photo of a meal (most likely Indian home food), to rows of a nutrition table.
Each item below has an index, the detected name, and candidate foods from the table with their ids.
For each item choose the candidate that is the same dish:
- It must be the same dish, not just share a word: "Paneer kheer" is not "Kadai Paneer".
- Spelling variants are the same dish, e.g. "Kadai" and "Kadhai", "Paratha" and "Parantha".
- For a generic name, choose the plain everyday version: "Paratha" -> the plain paratha, not dal or paneer paratha; "Roti" -> chapati/roti, not soya or makki roti.
- If no candidate is the same dish, use foodId 0.
Return one pick per item, with the item's index and the chosen candidate's id.`;

// "None" is foodId 0 rather than null, because a plain integer is the
// simplest schema for structured output. 0 is never a real id, so the
// candidate check below turns it into null.
const pickJsonSchema = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, foodId: { type: "integer" } },
        required: ["index", "foodId"],
      },
    },
  },
  required: ["picks"],
};

// The overall shape must be right; a single bad entry is just skipped.
const picksResponseSchema = z.object({ picks: z.array(z.unknown()) });
const pickSchema = z.object({
  index: z.number().int().min(0),
  foodId: z.number().int().nullable(),
});

// items: [{ detected, grams, candidates: [{ id, name }] }]
// Returns one entry per item: the chosen candidate's id, or null when no
// candidate is the same dish (or the model picked an id that wasn't offered).
export async function pickMatches(
  items,
  { create = defaultCreate, sleep = defaultSleep, now = Date.now } = {}
) {
  const toAsk = items
    .map((item, index) => ({ index, detected: item.detected, candidates: item.candidates }))
    .filter((item) => item.candidates.length > 0);
  if (toAsk.length === 0) return items.map(() => null);

  const listing = toAsk.map(({ index, detected, candidates }) => ({
    index,
    detected,
    candidates: candidates.map(({ id, name }) => ({ id, name })),
  }));

  const parsed = await generateJson({
    label: "pickMatches",
    input: [{ type: "text", text: `${PICK_PROMPT}\n\nItems:\n${JSON.stringify(listing)}` }],
    schema: pickJsonSchema,
    timing: TEXT_TIMING,
    create,
    sleep,
    now,
  });

  const response = picksResponseSchema.safeParse(parsed);
  if (!response.success) {
    throw new Error("Gemini returned picks in the wrong shape");
  }

  const picked = items.map(() => null);
  const seen = new Set();
  for (const raw of response.data.picks) {
    const pick = pickSchema.safeParse(raw);
    if (!pick.success) continue;
    const { index, foodId } = pick.data;
    if (index >= items.length || seen.has(index)) continue;
    seen.add(index);
    // Only an id we actually offered for this item counts.
    if (items[index].candidates.some((c) => c.id === foodId)) picked[index] = foodId;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// estimateNutrition: typical values per 100 g for foods not in our table.

const ESTIMATE_PROMPT = `For each food below, give typical nutrition values per 100 g of the food as usually prepared in an Indian home:
- calories: kcal per 100 g
- protein_g, fat_g, carbs_g: grams per 100 g
Return one estimate per food, with the food's index.`;

const estimateJsonSchema = {
  type: "object",
  properties: {
    estimates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          calories: { type: "number" },
          protein_g: { type: "number" },
          fat_g: { type: "number" },
          carbs_g: { type: "number" },
        },
        required: ["index", "calories", "protein_g", "fat_g", "carbs_g"],
      },
    },
  },
  required: ["estimates"],
};

const estimatesResponseSchema = z.object({ estimates: z.array(z.unknown()) });
const macro = z.number().min(0).max(100);
const estimateSchema = z
  .object({
    index: z.number().int().min(0),
    calories: z.number().min(0).max(900),
    protein_g: macro,
    fat_g: macro,
    carbs_g: macro,
  })
  .refine((e) => e.protein_g + e.fat_g + e.carbs_g <= 100);

// items: [{ name }]
// Returns one entry per item: { calories, protein_g, fat_g, carbs_g } per 100 g,
// or null when the model gave no estimate or impossible numbers for it.
export async function estimateNutrition(
  items,
  { create = defaultCreate, sleep = defaultSleep, now = Date.now } = {}
) {
  if (items.length === 0) return [];

  const listing = items.map(({ name }, index) => ({ index, name }));

  const parsed = await generateJson({
    label: "estimateNutrition",
    input: [{ type: "text", text: `${ESTIMATE_PROMPT}\n\nFoods:\n${JSON.stringify(listing)}` }],
    schema: estimateJsonSchema,
    timing: TEXT_TIMING,
    create,
    sleep,
    now,
  });

  const response = estimatesResponseSchema.safeParse(parsed);
  if (!response.success) {
    throw new Error("Gemini returned estimates in the wrong shape");
  }

  const estimates = items.map(() => null);
  for (const raw of response.data.estimates) {
    const estimate = estimateSchema.safeParse(raw);
    if (!estimate.success) continue;
    const { index, ...per100g } = estimate.data;
    if (index < items.length && estimates[index] === null) estimates[index] = per100g;
  }
  return estimates;
}
