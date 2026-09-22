import type { FunctionTool } from "openai/resources/live/live";
import { instrumentsById } from "../catalogue";

export const liveTools = [
  {
    type: "function",
    name: "suggest_instrument",
    description:
      "Show 1–3 instruments from the catalogue while you discuss them. Each call replaces the visible shortlist. Only suggest; this does not finalize a choice.",
    parameters: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              instrumentId: {
                type: "string",
                enum: [...instrumentsById.keys()],
              },
              reason: {
                type: "string",
                description:
                  "A short personalized reason, in the user's current language.",
              },
            },
            required: ["instrumentId", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finalize_choice",
    description:
      "Replace all suggestions with the user's confirmed choice. ONLY after the user explicitly confirms this previously suggested instrument in a NEW user turn. Interest, questions, a hypothetical choice, and ambiguous agreement are NOT confirmation. Ask if uncertain.",
    parameters: {
      type: "object",
      properties: {
        instrumentId: { type: "string", enum: [...instrumentsById.keys()] },
        reason: {
          type: "string",
          description:
            "Brief celebration and reason this fits, in the user's language.",
        },
        explicitlyConfirmed: { type: "boolean", enum: [true] },
        confirmationQuote: {
          type: "string",
          description:
            "Quote the user's explicit confirmation in its ORIGINAL language, from their latest turn. Never invent or translate this quote.",
        },
      },
      required: [
        "instrumentId",
        "reason",
        "explicitlyConfirmed",
        "confirmationQuote",
      ],
      additionalProperties: false,
    },
  },
] satisfies FunctionTool[];
