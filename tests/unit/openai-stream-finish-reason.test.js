import { describe, it, expect } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

async function runStream(streamOptions, inputs) {
  const stream = createSSEStream(streamOptions);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const decoder = new TextDecoder();
  const readPromise = (async () => {
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
  })();
  for (const input of inputs) {
    await writer.write(new TextEncoder().encode(input));
  }
  await writer.close();
  return readPromise;
}

describe("OpenAI Chat stream terminal guarantees", () => {
  it("guarantees finish_reason and [DONE] on abrupt Gemini upstream close", async () => {
    const geminiChunk = JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Hello from Gemini" }] } }]
    });
    const out = await runStream({
      mode: "translate",
      targetFormat: FORMATS.GEMINI,
      sourceFormat: FORMATS.OPENAI,
      provider: "gemini",
      model: "gemini-2.5-flash"
    }, [`data: ${geminiChunk}\n\n`]);

    expect(out).toContain('"finish_reason":"stop"');
    expect(out.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("guarantees finish_reason and [DONE] when Gemini upstream sends [DONE]", async () => {
    const geminiChunk = JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Hello from Gemini" }] } }]
    });
    const out = await runStream({
      mode: "translate",
      targetFormat: FORMATS.GEMINI,
      sourceFormat: FORMATS.OPENAI,
      provider: "gemini",
      model: "gemini-2.5-flash"
    }, [`data: ${geminiChunk}\n\n`, "data: [DONE]\n\n"]);

    expect(out).toContain('"finish_reason":"stop"');
    expect(out.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("guarantees finish_reason and [DONE] on abrupt Claude upstream close", async () => {
    const out = await runStream({
      mode: "translate",
      targetFormat: FORMATS.CLAUDE,
      sourceFormat: FORMATS.OPENAI,
      provider: "claude",
      model: "claude-3-5-sonnet"
    }, [
      `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"claude-3-5-sonnet"}}\n\n`,
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n`
    ]);

    expect(out).toContain('"finish_reason":"stop"');
    expect(out.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("guarantees finish_reason before [DONE] on passthrough stream when upstream only sends null finish_reason", async () => {
    const chunk = JSON.stringify({
      id: "chatcmpl-123",
      object: "chat.completion.chunk",
      created: 1700000000,
      model: "gpt-4o",
      choices: [{ index: 0, delta: { content: "hey" }, finish_reason: null }]
    });
    const out = await runStream({
      mode: "passthrough",
      provider: "openai",
      model: "gpt-4o"
    }, [`data: ${chunk}\n\n`, "data: [DONE]\n\n"]);

    expect(out).toContain('"finish_reason":"stop"');
    expect(out.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});
