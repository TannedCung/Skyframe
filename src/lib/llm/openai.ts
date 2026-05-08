import type OpenAISDK from "openai";
import logger from "@/lib/logger";

let _client: OpenAISDK | null = null;

async function getClient(): Promise<OpenAISDK> {
  if (!_client) {
    const { default: OpenAI } = await import("openai");
    _client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] ?? "" });
  }
  return _client!;
}

export async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  logger.debug("Calling OpenAI API");
  const client = await getClient();
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 4096,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Unexpected OpenAI response format");
  return content;
}
