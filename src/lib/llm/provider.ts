import { callAnthropic } from "./anthropic";
import { callOpenAI } from "./openai";
import logger from "@/lib/logger";

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  // Try Anthropic first, fall back to OpenAI
  if (process.env["ANTHROPIC_API_KEY"]) {
    try {
      return await callAnthropic(systemPrompt, userPrompt);
    } catch (error) {
      logger.warn({ error }, "Anthropic failed, falling back to OpenAI");
    }
  }

  if (process.env["OPENAI_API_KEY"]) {
    return await callOpenAI(systemPrompt, userPrompt);
  }

  throw new Error("No LLM provider configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY");
}

export function parseJsonFromLLM<T>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}
