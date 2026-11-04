import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

// Extra tries on MODEL after the first one fails, and the wait before each.
const RETRY_DELAYS_MS = [1000];
const MAX_JITTER_MS = 250;
// Per-attempt limit. @google/genai 2.32 takes `timeout_ms` in the request
// options of interactions.create and throws APIConnectionTimeoutError when it
// runs out (with automatic continuation it bounds the whole call).
const ATTEMPT_TIMEOUT_MS = 15_000;
// Whole readPlate call, attempts and waits included. An attempt isn't started
// with less than MIN_ATTEMPT_MS left.
const TOTAL_BUDGET_MS = 45_000;
const MIN_ATTEMPT_MS = 5_000;
// Kept back from MODEL attempts so FALLBACK_MODEL always gets a real try.
const FALLBACK_RESERVE_MS = 12_000;

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

export async function readPlate(
  imageBuffer,
  mimeType,
  { create = defaultCreate, sleep = defaultSleep, now = Date.now } = {}
) {
  const deadline = now() + TOTAL_BUDGET_MS;
  const timeLeft = () => deadline - now();

  const request = (model, timeoutMs) =>
    create(
      {
        model,
        input: [
          { type: "text", text: PROMPT },
          { type: "image", data: imageBuffer.toString("base64"), mime_type: mimeType },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: jsonSchema,
        },
      },
      // The SDK retries 5xx/429 by default (up to 4 times, waiting up to 8s each);
      // turn that off so our own retries and time budget control the timing.
      { timeout_ms: timeoutMs, retries: { strategy: "none" } }
    );

  // reserveMs is budget this step may not use, because a later step needs it.
  const plan = [
    { model: MODEL, delayMs: 0, reserveMs: FALLBACK_RESERVE_MS },
    ...RETRY_DELAYS_MS.map((delayMs) => ({
      model: MODEL,
      delayMs,
      reserveMs: FALLBACK_RESERVE_MS,
    })),
    { model: FALLBACK_MODEL, delayMs: 0, reserveMs: 0 },
  ];

  let interaction;
  let lastError;
  for (const [i, { model, delayMs, reserveMs }] of plan.entries()) {
    const available = () => timeLeft() - reserveMs;
    const outOfTime = (pendingWait) => lastError && available() - pendingWait < MIN_ATTEMPT_MS;

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
        console.warn(`readPlate: no time for attempt ${i + 1}/${plan.length} on ${model}, skipping`);
        continue;
      }
      console.warn(`readPlate: out of time budget before attempt ${i + 1}/${plan.length}`);
      throw lastError;
    }

    try {
      interaction = await request(model, Math.min(ATTEMPT_TIMEOUT_MS, available()));
      break;
    } catch (err) {
      console.warn(
        `readPlate: attempt ${i + 1}/${plan.length} on ${model} failed (${describeError(err)})`
      );
      if (!isRetryable(err) || i === plan.length - 1) throw err;
      lastError = err;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(interaction.output_text);
  } catch {
    throw new Error("Gemini did not return valid JSON");
  }

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Gemini returned data in the wrong shape");
  }
  return result.data.items;
}