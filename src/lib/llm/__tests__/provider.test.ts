/**
 * @jest-environment node
 */
import { parseJsonFromLLM } from "../provider";

describe("parseJsonFromLLM", () => {
  it("parses plain JSON", () => {
    const result = parseJsonFromLLM<{ foo: string }>('{"foo": "bar"}');
    expect(result.foo).toBe("bar");
  });

  it("strips markdown code fences", () => {
    const result = parseJsonFromLLM<{ x: number }>('```json\n{"x": 42}\n```');
    expect(result.x).toBe(42);
  });

  it("strips plain code fences", () => {
    const result = parseJsonFromLLM<{ ok: boolean }>('```\n{"ok": true}\n```');
    expect(result.ok).toBe(true);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonFromLLM("not json at all")).toThrow("LLM returned invalid JSON");
  });

  it("handles nested objects", () => {
    const result = parseJsonFromLLM<{ options: { id: string }[] }>(
      '{"options": [{"id": "opt-1"}]}',
    );
    expect(result.options[0]?.id).toBe("opt-1");
  });
});

describe("callLLM (mocked Anthropic)", () => {
  it("calls Anthropic SDK and returns text content", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"result":"ok"}' }],
    });

    jest.mock("@anthropic-ai/sdk", () => ({
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    process.env["ANTHROPIC_API_KEY"] = "test-key";
    jest.resetModules();

    const { callLLM } = await import("../provider");
    const result = await callLLM("system", "user");
    expect(typeof result).toBe("string");

    delete process.env["ANTHROPIC_API_KEY"];
  });

  it("throws when no provider is configured", async () => {
    const savedAnthropicKey = process.env["ANTHROPIC_API_KEY"];
    const savedOpenAIKey = process.env["OPENAI_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OPENAI_API_KEY"];

    jest.resetModules();
    const { callLLM } = await import("../provider");

    await expect(callLLM("system", "user")).rejects.toThrow("No LLM provider configured");

    process.env["ANTHROPIC_API_KEY"] = savedAnthropicKey;
    process.env["OPENAI_API_KEY"] = savedOpenAIKey;
  });
});
