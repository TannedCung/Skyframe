import type AnthropicSDK from "@anthropic-ai/sdk";
import logger from "@/lib/logger";

let _client: AnthropicSDK | null = null;

async function getClient(): Promise<AnthropicSDK> {
  if (!_client) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    _client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] ?? "" });
  }
  return _client!;
}

export async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  logger.debug("Calling Anthropic API");
  const client = await getClient();
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected Anthropic response format");
  }
  return block.text;
}
