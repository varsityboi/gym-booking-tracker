import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.8-flash";

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

export async function readPlate(imageBuffer, mimeType) {
  const interaction = await client.interactions.create({
    model: MODEL,
    input: [
      { type: "text", text: PROMPT },
      { type: "image", data: imageBuffer.toString("base64"), mime_type: mimeType },
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

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