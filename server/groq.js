// Groq's OpenAI-compatible chat completions API, called with plain fetch.
// Docs: https://console.groq.com/docs/vision, /docs/structured-outputs

const URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-20b";
export const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

// An HTTP error from Groq. `error` is the parsed body ({ error: { message, type, code } })
// so the shared retry check can read the code, like the Gemini SDK errors.
class GroqError extends Error {
  constructor(status, bodyText) {
    super(`Groq HTTP ${status}: ${bodyText.slice(0, 500)}`);
    this.name = "GroqError";
    this.status = status;
    try {
      this.error = JSON.parse(bodyText);
    } catch {
      this.error = undefined;
    }
  }
}

// One attempt; returns the reply text (JSON as a string).
// - content: a string, or content parts (text and image_url) for vision.
// - Images go as a base64 data URL. Groq documents a 20 MB request limit and
//   no separate base64 or resolution limit; our uploads are capped at 8 MB
//   (about 10.7 MB as base64), so no compression is needed.
// - strict: false (best effort): strict mode needs additionalProperties: false
//   on every object, and we send the same schemas as for Gemini.
// - Timeout: AbortSignal.timeout makes fetch throw a TimeoutError (also while
//   reading the body). A dropped connection is fetch's TypeError "fetch failed".
//   HTTP errors throw GroqError with a numeric status.
export async function groqChat({ model, content, schemaName, schema, timeoutMs }) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: false, schema },
      },
      temperature: 0,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) throw new GroqError(res.status, body);
  return JSON.parse(body).choices?.[0]?.message?.content;
}
