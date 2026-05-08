/**
 * @jest-environment node
 */

jest.mock("../anthropic", () => ({
  callAnthropic: jest.fn(),
}));

jest.mock("../openai", () => ({
  callOpenAI: jest.fn(),
}));

import { parseJsonFromLLM, callLLM } from "../provider";
import { callAnthropic } from "../anthropic";
import { callOpenAI } from "../openai";

const mockCallAnthropic = jest.mocked(callAnthropic);
const mockCallOpenAI = jest.mocked(callOpenAI);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["OPENAI_API_KEY"];
});

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

describe("callLLM", () => {
  it("calls Anthropic when ANTHROPIC_API_KEY is set and returns its result", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockCallAnthropic.mockResolvedValue('{"result":"ok"}');

    const result = await callLLM("system", "user");

    expect(result).toBe('{"result":"ok"}');
    expect(mockCallAnthropic).toHaveBeenCalledWith("system", "user");
    expect(mockCallOpenAI).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when Anthropic throws", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    process.env["OPENAI_API_KEY"] = "openai-key";
    mockCallAnthropic.mockRejectedValue(new Error("Anthropic down"));
    mockCallOpenAI.mockResolvedValue("openai-response");

    const result = await callLLM("system", "user");

    expect(result).toBe("openai-response");
    expect(mockCallOpenAI).toHaveBeenCalledWith("system", "user");
  });

  it("uses OpenAI directly when only OPENAI_API_KEY is set", async () => {
    process.env["OPENAI_API_KEY"] = "openai-key";
    mockCallOpenAI.mockResolvedValue("openai-only-response");

    const result = await callLLM("system", "user");

    expect(result).toBe("openai-only-response");
    expect(mockCallAnthropic).not.toHaveBeenCalled();
  });

  it("throws when no provider is configured", async () => {
    await expect(callLLM("system", "user")).rejects.toThrow(
      "No LLM provider configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY",
    );
  });
});
