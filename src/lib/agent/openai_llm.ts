import { BaseLlm } from "@google/adk";
import type { LlmRequest, LlmResponse } from "@google/adk";
import type { Content, Part } from "@google/genai";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

let _client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] ?? "" });
  return _client;
}

// ─── Format converters ───────────────────────────────────────────────────────

function contentsToOpenAI(contents: Content[], systemText?: string): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  if (systemText) messages.push({ role: "system", content: systemText });

  for (const c of contents) {
    if (!c.parts?.length) continue;

    const funcResponses = c.parts.filter((p) => p.functionResponse);
    const funcCalls = c.parts.filter((p) => p.functionCall);
    const textParts = c.parts.filter((p) => p.text);

    if (funcResponses.length > 0) {
      for (const p of funcResponses) {
        messages.push({
          role: "tool",
          tool_call_id:
            (p.functionResponse as { id?: string; name?: string; response?: unknown })?.id ??
            `tool_${Date.now()}`,
          content: JSON.stringify((p.functionResponse as { response?: unknown })?.response ?? {}),
        });
      }
    } else if (funcCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: funcCalls.map((p) => {
          const fc = p.functionCall as { id?: string; name?: string; args?: unknown };
          return {
            id: fc.id ?? `call_${Date.now()}`,
            type: "function" as const,
            function: {
              name: fc.name ?? "",
              arguments: JSON.stringify(fc.args ?? {}),
            },
          };
        }),
      });
    } else if (textParts.length > 0) {
      const text = textParts.map((p) => p.text ?? "").join("");
      const role = c.role === "model" ? "assistant" : "user";
      messages.push({ role, content: text });
    }
  }

  return messages;
}

function extractSystemText(systemInstruction: unknown): string | undefined {
  if (!systemInstruction) return undefined;
  if (typeof systemInstruction === "string") return systemInstruction;
  const c = systemInstruction as Content;
  return c.parts?.map((p: Part) => p.text ?? "").join("\n") || undefined;
}

function toolsToOpenAI(toolsDict: LlmRequest["toolsDict"]): ChatCompletionTool[] {
  return Object.values(toolsDict).map((tool) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decl = (tool as any)._getDeclaration?.() as
      | {
          name?: string;
          description?: string;
          parameters?: Record<string, unknown>;
        }
      | undefined;
    return {
      type: "function" as const,
      function: {
        name: decl?.name ?? tool.name,
        description: decl?.description ?? tool.description ?? "",
        parameters: (decl?.parameters as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      },
    };
  });
}

// ─── Custom BaseLlm for OpenAI ───────────────────────────────────────────────

export class OpenAILlm extends BaseLlm {
  // LLMRegistry wraps these patterns with ^...$ during resolve, so do NOT add anchors.
  static readonly supportedModels: Array<string | RegExp> = [/gpt-.*/, /o[0-9].*/];

  constructor({ model }: { model: string }) {
    super({ model });
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = false,
  ): AsyncGenerator<LlmResponse, void> {
    const openai = getOpenAI();
    const systemText = extractSystemText(llmRequest.config?.systemInstruction);
    const messages = contentsToOpenAI(llmRequest.contents, systemText);
    const tools = toolsToOpenAI(llmRequest.toolsDict);
    const toolsArg = tools.length > 0 ? tools : undefined;

    if (stream) {
      const streamResp = await openai.chat.completions.create({
        model: this.model,
        messages,
        tools: toolsArg,
        stream: true,
      });

      let textAcc = "";
      const toolCallAcc: Map<number, { id: string; name: string; args: string }> = new Map();

      for await (const chunk of streamResp) {
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason;

        if (delta?.content) {
          textAcc += delta.content;
          yield { content: { role: "model", parts: [{ text: delta.content }] }, partial: true };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallAcc.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallAcc.set(tc.index, existing);
          }
        }

        if (finishReason === "tool_calls") {
          yield {
            content: {
              role: "model",
              parts: [...toolCallAcc.values()].map((tc) => ({
                functionCall: {
                  id: tc.id,
                  name: tc.name,
                  args: JSON.parse(tc.args || "{}"),
                },
              })),
            },
            turnComplete: true,
          };
          return;
        }

        if (finishReason === "stop") {
          yield { content: { role: "model", parts: [{ text: textAcc }] }, turnComplete: true };
          return;
        }
      }
    } else {
      const resp = await openai.chat.completions.create({
        model: this.model,
        messages,
        tools: toolsArg,
        stream: false,
      });

      const choice = resp.choices[0]!;

      if (choice.message.tool_calls?.length) {
        type FnToolCall = {
          type: "function";
          id: string;
          function: { name: string; arguments: string };
        };
        yield {
          content: {
            role: "model",
            parts: choice.message.tool_calls
              .filter((tc): tc is FnToolCall => tc.type === "function")
              .map((tc) => ({
                functionCall: {
                  id: tc.id,
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments || "{}"),
                },
              })),
          },
          turnComplete: true,
        };
      } else {
        yield {
          content: {
            role: "model",
            parts: [{ text: choice.message.content ?? "" }],
          },
          turnComplete: true,
        };
      }
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<never> {
    throw new Error("Live connections are not supported for OpenAI LLM");
  }
}
