import { translateResponse, initState } from "../translator/index.js";
import { FORMATS } from "../translator/formats.js";
import { PROVIDERS } from "../config/providers.js";
import { liftReasoningAliases } from "../translator/concerns/reasoning.js";
import { trackPendingRequest, appendRequestLog } from "@/lib/usageDb.js";
import { extractUsage, mergeUsage, hasValidUsage, estimateUsage, logUsage, addBufferToUsage, filterUsageForFormat, COLORS } from "./usageTracking.js";
import { parseSSELine, hasValuableContent, fixInvalidId, formatSSE, ensureStreamToolCallIds } from "./streamHelpers.js";
import { restoreToolNames } from "./opencodeFingerprint.js";
import { getOpenAIResponsesEventName, isOpenAIResponsesTerminalEvent, formatIncompleteOpenAIResponsesStreamFailure } from "./responsesStreamHelpers.js";
import { dbg, isDebugEnabled } from "./debugLog.js";

import { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER } from "./sseConstants.js";

export { COLORS, formatSSE };
export { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER };

// sharedEncoder is stateless — safe to share across streams
const sharedEncoder = new TextEncoder();

/**
 * Stream modes
 */
const STREAM_MODE = {
  TRANSLATE: "translate",    // Full translation between formats
  PASSTHROUGH: "passthrough" // No translation, normalize output, extract usage
};

// Upper bound on the deferred response.completed wait: a chat->responses stream
// that saw finish_reason without usage must not hold the client's terminal event
// forever when the upstream stalls with no usage trailer and no [DONE].
const PENDING_COMPLETION_FLUSH_MS = 3000;

/**
 * Fast RFC 8259 string scanner to extract a JSON string property value with its quotes intact.
 * Handles escaped quotes, backslashes, unicode, etc.
 */
function extractJsonString(line, key) {
  const keyIdx = line.indexOf(key);
  if (keyIdx === -1) return null;
  const startQuote = line.indexOf('"', keyIdx + key.length);
  if (startQuote === -1) return null;
  let endQuote = -1;
  for (let j = startQuote + 1; j < line.length; j++) {
    if (line.charCodeAt(j) === 34) { // "\""
      let backslashes = 0;
      let k = j - 1;
      while (k >= startQuote && line.charCodeAt(k) === 92) {
        backslashes++;
        k--;
      }
      if ((backslashes & 1) === 0) { // even number of backslashes means unescaped quote
        endQuote = j;
        break;
      }
    }
  }
  if (endQuote === -1) return null;
  return line.slice(startQuote, endQuote + 1);
}

function tryFastClaudeToOpenAI(trimmed, state) {
  if (!trimmed.includes('"content_block_delta"')) return null;

  if (trimmed.includes('"text_delta"')) {
    const rawText = extractJsonString(trimmed, '"text":');
    if (!rawText || rawText === '""') return null;
    const nowSec = state.created || Math.floor(Date.now() / 1000);
    const sse = `data: {"id":"chatcmpl-${state.messageId}","object":"chat.completion.chunk","created":${nowSec},"model":"${state.model || "gpt-4o"}","choices":[{"index":0,"delta":{"content":${rawText}},"finish_reason":null}]}\n\n`;
    return { sse, contentLength: Math.max(0, rawText.length - 2) };
  }

  if (trimmed.includes('"thinking_delta"')) {
    const rawThinking = extractJsonString(trimmed, '"thinking":');
    if (!rawThinking || rawThinking === '""') return null;
    const nowSec = state.created || Math.floor(Date.now() / 1000);
    const sse = `data: {"id":"chatcmpl-${state.messageId}","object":"chat.completion.chunk","created":${nowSec},"model":"${state.model || "gpt-4o"}","choices":[{"index":0,"delta":{"reasoning_content":${rawThinking}},"finish_reason":null}]}\n\n`;
    return { sse, contentLength: Math.max(0, rawThinking.length - 2) };
  }

  return null;
}

/**
 * Create unified SSE transform stream
 * @param {object} options
 * @param {string} options.mode - Stream mode: translate, passthrough
 * @param {string} options.targetFormat - Provider format (for translate mode)
 * @param {string} options.sourceFormat - Client format (for translate mode)
 * @param {string} options.provider - Provider name
 * @param {object} options.reqLogger - Request logger instance
 * @param {string} options.model - Model name
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {object} options.body - Request body (for input token estimation)
 * @param {function} options.onStreamComplete - Callback when stream completes (content, usage)
 * @param {string} options.apiKey - API key for usage tracking
 */
export function createSSEStream(options = {}) {
  const {
    mode = STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider = null,
    reqLogger = null,
    toolNameMap = null,
    customToolNames = null,
    model = null,
    connectionId = null,
    body = null,
    onStreamComplete = null,
    apiKey = null,
    credentials = null
  } = options;

  let buffer = "";
  let usage = null;

  // Tool-call ids already sent to the client, keyed by the tool-call index.
  // A late fragment that opens a NEW index without an id must not reach the
  // client as-is: strict OpenAI-compatible SDKs abort the turn on a
  // tool_call without a string id (#4992).
  const seenToolCallIds = new Map();

  // Per-stream decoder with stream:true to correctly handle multi-byte chars split across chunks
  const decoder = new TextDecoder("utf-8", { fatal: false });

  const state = mode === STREAM_MODE.TRANSLATE
    ? { ...initState(sourceFormat), provider, toolNameMap, customToolNames: new Set(customToolNames || []), model, sessionId: credentials?._clientSessionId || null,
        // Which upstream format this stream came from. A response translator can be
        // reached either directly (target === its registered source) or as the second
        // hop of a pivot, and on the terminal null chunk the pivot drops it — so a
        // translator that defers closing events until flush needs to know which case
        // it is in. Absent/undefined means "unknown", i.e. do not defer.
        targetFormat }
    : null;

  let totalContentLength = 0;
  let ttftAt = null;
  let sseLineCount = 0;
  let sseEmittedCount = 0;
  const eventTypeCounts = {};

  // Track Responses API event framing for same-format passthrough (codex)
  let currentOpenAIResponsesEvent = null;
  let openAIResponsesTerminalSeen = false;
  let openAIResponsesDoneSent = false;
  let streamDoneSent = false;  // track duplicate [DONE] across transform + flush
  let finalized = false;
  let completionFlushTimer = null;
  let seenFinishReason = false;

  // Lane quirk: upstream streams thinking under the OpenRouter aliases
  // (`reasoning` / `reasoning_details[]`) instead of reasoning_content — OpenCode
  // Free's MiMo route does. Lift it on every passthrough delta so OpenAI-shaped
  // clients, the thinking accumulation below and usage accounting see the text.
  const liftAliases = mode === STREAM_MODE.PASSTHROUGH && !!PROVIDERS[provider]?.quirks?.reasoningAliasFields;

  // Usage/logging tail, callable from transform() as well as flush(): a client that
  // closes right after the terminal event cancels the reader, and flush() never runs.
  const finalizeStream = () => {
    if (completionFlushTimer) { clearTimeout(completionFlushTimer); completionFlushTimer = null; }
    if (finalized) return;
    finalized = true;

    const isPassthrough = mode === STREAM_MODE.PASSTHROUGH;
    let finalUsage = isPassthrough ? usage : state?.usage;

    if (!hasValidUsage(finalUsage) && totalContentLength > 0) {
      finalUsage = estimateUsage(body, totalContentLength, isPassthrough ? FORMATS.OPENAI : sourceFormat);
      if (isPassthrough) usage = finalUsage; else state.usage = finalUsage;
    }

    if (hasValidUsage(finalUsage)) {
      logUsage(isPassthrough ? provider : (state?.provider || targetFormat), finalUsage, model, connectionId, apiKey);
    } else {
      appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
    }

    if (onStreamComplete) {
      onStreamComplete({
        content: "",
        thinking: null
      }, finalUsage, ttftAt);
    }
  };

  // Emit the deferred response.completed now — at [DONE], or when the watchdog
  // below gives up on a usage trailer that never arrives.
  const flushPendingCompletion = (controller) => {
    const completed = translateResponse(targetFormat, sourceFormat, null, state);
    for (const item of completed || []) {
      if (item === null || item === undefined) continue;
      const output = formatSSE(item, sourceFormat);
      reqLogger?.appendConvertedChunk?.(output);
      controller.enqueue(sharedEncoder.encode(output));
      sseEmittedCount++;
    }
    finalizeStream();
  };

  return new TransformStream({
    transform(chunk, controller) {
      if (!ttftAt) ttftAt = Date.now();
      const text = decoder.decode(chunk, { stream: true });
      buffer += text;
      reqLogger?.appendProviderChunk?.(text);

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (isDebugEnabled && trimmed) {
          sseLineCount++;
          if (trimmed.startsWith("event:")) {
            const evt = trimmed.slice(6).trim();
            eventTypeCounts[evt] = (eventTypeCounts[evt] || 0) + 1;
          }
        }

        // Capture Responses API event name to preserve framing in same-format passthrough
        if (mode === STREAM_MODE.TRANSLATE && targetFormat === FORMATS.OPENAI_RESPONSES && trimmed.startsWith("event:")) {
          currentOpenAIResponsesEvent = trimmed.slice(6).trim();
        }

        // Passthrough mode: normalize and forward
        if (mode === STREAM_MODE.PASSTHROUGH) {
          let output;
          let injectedUsage = false;
          let responsesTerminal = false;

          // Upstream already sent the sentinel; flush() must not append a second one.
          if (trimmed.startsWith("data:") && trimmed.slice(5).trim() === "[DONE]") streamDoneSent = true;

          if (trimmed.startsWith("data:") && trimmed.slice(5).trim() !== "[DONE]") {
            try {
              let parsed = JSON.parse(trimmed.slice(5).trim());

              const idFixed = fixInvalidId(parsed);

              // A fragment that opens a new tool-call index without an id breaks
              // strict OpenAI-compatible clients. Mint/reuse one before the
              // chunk reaches the client.
              const toolCallIdFixed = ensureStreamToolCallIds(parsed, seenToolCallIds);

              // The fingerprint pass renames a colliding caller tool to an alias
              // (read -> read_client). On this path nothing restored it, so the
              // client received a call to a tool it never declared and answered
              // "Model tried to call unavailable tool 'read_client'" (#4986).
              let toolNameRestored = false;
              if (toolNameMap?.size) {
                const restored = restoreToolNames(parsed, toolNameMap);
                if (restored !== parsed) {
                  parsed = restored;
                  toolNameRestored = true;
                }
              }

              // Ensure OpenAI-required fields are present on streaming chunks (Letta compat)
              let fieldsInjected = false;
              if (parsed.choices !== undefined) {
                if (!parsed.object) { parsed.object = "chat.completion.chunk"; fieldsInjected = true; }
                if (!parsed.created) { parsed.created = Math.floor(Date.now() / 1000); fieldsInjected = true; }
              }

              // Strip Azure-specific non-standard fields from streaming chunks
              if (parsed.prompt_filter_results !== undefined) {
                delete parsed.prompt_filter_results;
                fieldsInjected = true;
              }
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.content_filter_results !== undefined) {
                    delete choice.content_filter_results;
                    fieldsInjected = true;
                  }
                }
              }

              // Alias lanes: expose thinking as reasoning_content (additive) before
              // the valuable-content check, so reasoning-only chunks survive.
              if (liftAliases && parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice?.delta) {
                    const lifted = liftReasoningAliases(choice.delta);
                    if (lifted !== choice.delta) {
                      choice.delta = lifted;
                      fieldsInjected = true;
                    }
                  }
                }
              }

              // Strip empty tool_calls arrays that break AI SDK reasoning tracking.
              // Some providers (e.g. CodeBuddy CN) include `"tool_calls": []` in
              // every streaming delta. @ai-sdk/openai-compatible checks
              // `delta.tool_calls != null` — an empty array passes this check,
              // causing premature `reasoning-end` on every chunk.
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.delta?.tool_calls && Array.isArray(choice.delta.tool_calls) && choice.delta.tool_calls.length === 0) {
                    delete choice.delta.tool_calls;
                    fieldsInjected = true;
                  }
                }
              }

              if (!hasValuableContent(parsed, FORMATS.OPENAI)) {
                continue;
              }

              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content;
              const reasoning = delta?.reasoning_content;
              if (content && typeof content === "string") {
                totalContentLength += content.length;
              }
              if (reasoning && typeof reasoning === "string") {
                totalContentLength += reasoning.length;
              }

              const extracted = extractUsage(parsed);
              if (extracted) {
                usage = mergeUsage(usage, extracted);
              }

              responsesTerminal = isOpenAIResponsesTerminalEvent(currentOpenAIResponsesEvent, parsed);

              if (parsed.choices?.[0]) {
                const choice = parsed.choices[0];
                if (seenFinishReason) {
                  // Drop trailing content chunks after finish_reason has already been emitted
                  continue;
                }
                if (choice.finish_reason) {
                  const finishReason = choice.finish_reason;
                  const delta = choice.delta || {};
                  const hasContent =
                    (typeof delta.content === "string" && delta.content !== "") ||
                    (typeof delta.reasoning_content === "string" && delta.reasoning_content !== "") ||
                    (typeof delta.reasoning === "string" && delta.reasoning !== "") ||
                    (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0);

                  if (hasContent) {
                    choice.finish_reason = null;
                    const chunk1 = `data: ${JSON.stringify(parsed)}\n\n`;
                    reqLogger?.appendConvertedChunk?.(chunk1);
                    controller.enqueue(sharedEncoder.encode(chunk1));
                    sseEmittedCount++;

                    choice.delta = {};
                    choice.finish_reason = finishReason;
                  }
                  seenFinishReason = true;
                }
              }

              const isFinishChunk = parsed.choices?.[0]?.finish_reason;
              if (isFinishChunk && !hasValidUsage(parsed.usage)) {
                const estimated = estimateUsage(body, totalContentLength, FORMATS.OPENAI);
                parsed.usage = filterUsageForFormat(estimated, FORMATS.OPENAI);
                output = `data: ${JSON.stringify(parsed)}\n`;
                usage = estimated;
                injectedUsage = true;
              } else if (isFinishChunk && usage) {
                const buffered = addBufferToUsage(usage);
                parsed.usage = filterUsageForFormat(buffered, FORMATS.OPENAI);
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              } else if (idFixed || fieldsInjected || toolCallIdFixed || toolNameRestored) {
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              }
            } catch {
              // Skip non-JSON data lines silently — don't forward garbage to clients.
              // Upstream providers sometimes return plain-text errors (HTML, rate-limit
              // messages) in the SSE stream that would break downstream JSON decoders.
              continue;
            }
          }

          if (!injectedUsage) {
            if (line.startsWith("data:") && !line.startsWith("data: ")) {
              output = "data: " + line.slice(5) + "\n";
            } else {
              output = line + "\n";
            }
          }

          reqLogger?.appendConvertedChunk?.(output);
          controller.enqueue(sharedEncoder.encode(output));
          // Responses clients (codex CLI) close on response.completed instead of [DONE]
          if (responsesTerminal) finalizeStream();
          continue;
        }

        // Translate mode
        if (!trimmed) continue;

        // Fast-path: Claude -> OpenAI text_delta / thinking_delta (zero-allocation parser)
        if (
          mode === STREAM_MODE.TRANSLATE &&
          targetFormat === FORMATS.CLAUDE &&
          sourceFormat === FORMATS.OPENAI &&
          state?.messageId &&
          (state.serverToolBlockIndex === undefined || state.serverToolBlockIndex === -1) &&
          trimmed.charCodeAt(0) === 100 // 'd' for "data:"
        ) {
          const fastOutput = tryFastClaudeToOpenAI(trimmed, state);
          if (fastOutput) {
            totalContentLength += fastOutput.contentLength;
            reqLogger?.appendConvertedChunk?.(fastOutput.sse);
            controller.enqueue(sharedEncoder.encode(fastOutput.sse));
            sseEmittedCount++;
            continue;
          }
        }

        const parsed = parseSSELine(trimmed, targetFormat);
        if (!parsed) continue;

        // Responses API same-format passthrough: preserve event framing + track terminal state
        const isOpenAIResponsesStream = targetFormat === FORMATS.OPENAI_RESPONSES;
        const keepsOpenAIResponsesFormat = isOpenAIResponsesStream && sourceFormat === FORMATS.OPENAI_RESPONSES;
        const openAIResponsesEventName = isOpenAIResponsesStream
          ? getOpenAIResponsesEventName(currentOpenAIResponsesEvent, parsed)
          : null;

        if (isOpenAIResponsesStream && isOpenAIResponsesTerminalEvent(openAIResponsesEventName, parsed)) {
          openAIResponsesTerminalSeen = true;
        }

        // For Ollama: done=true is the final chunk with finish_reason/usage, must translate
        // For other formats: done=true is the [DONE] sentinel, skip
        if (parsed && parsed.done && targetFormat !== FORMATS.OLLAMA) {
          // A direct Chat-to-Responses translation can defer response.completed
          // while waiting for a usage trailer. [DONE] ends that opportunity even
          // if the upstream keeps the HTTP connection open, so finish now.
          if (targetFormat === FORMATS.OPENAI && sourceFormat === FORMATS.OPENAI_RESPONSES &&
              state.completionPending && !state.completedSent) {
            flushPendingCompletion(controller);
          }

          // Synthesize response.failed if the Responses stream never sent a terminal event
          if (keepsOpenAIResponsesFormat && !openAIResponsesTerminalSeen) {
            const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
            reqLogger?.appendConvertedChunk?.(failedOutput);
            controller.enqueue(sharedEncoder.encode(failedOutput));
            openAIResponsesTerminalSeen = true;
            sseEmittedCount++;
          }

          if (keepsOpenAIResponsesFormat && !streamDoneSent) {
            const doneOutput = "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            controller.enqueue(sharedEncoder.encode(doneOutput));
          }
          streamDoneSent = true;
          if (keepsOpenAIResponsesFormat) openAIResponsesDoneSent = true;
          continue;
        }

        // Claude format - content
        if (parsed.delta?.text) {
          totalContentLength += parsed.delta.text.length;
        }
        // Claude format - thinking
        if (parsed.delta?.thinking) {
          totalContentLength += parsed.delta.thinking.length;
        }
        
        // OpenAI format - content
        if (parsed.choices?.[0]?.delta?.content) {
          totalContentLength += parsed.choices[0].delta.content.length;
        }
        // OpenAI format - reasoning
        if (parsed.choices?.[0]?.delta?.reasoning_content) {
          totalContentLength += parsed.choices[0].delta.reasoning_content.length;
        }
        
        // Gemini format
        if (parsed.candidates?.[0]?.content?.parts) {
          for (const part of parsed.candidates[0].content.parts) {
            if (part.text && typeof part.text === "string") {
              totalContentLength += part.text.length;
            }
          }
        }

        // Extract usage
        const extracted = extractUsage(parsed);
        if (extracted) state.usage = mergeUsage(state.usage, extracted); // Keep original usage for logging

        // Responses same-format passthrough: re-emit with original event framing
        if (keepsOpenAIResponsesFormat && openAIResponsesEventName) {
          const output = formatSSE({ event: openAIResponsesEventName, data: parsed }, sourceFormat);
          reqLogger?.appendConvertedChunk?.(output);
          controller.enqueue(sharedEncoder.encode(output));
          currentOpenAIResponsesEvent = null;
          sseEmittedCount++;
          // Responses clients (codex) close on response.completed instead of [DONE]
          if (openAIResponsesTerminalSeen) finalizeStream();
          continue;
        }

        currentOpenAIResponsesEvent = null;

        // Translate: targetFormat -> openai -> sourceFormat
        const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

        // Log OpenAI intermediate chunks (if available)
        if (translated?._openaiIntermediate) {
          for (const item of translated._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (translated?.length > 0) {
          for (const item of translated) {
            if (item === null || item === undefined) continue;
            // Filter empty chunks
            if (!hasValuableContent(item, sourceFormat)) {
              continue; // Skip this empty chunk
            }

            if (sourceFormat === FORMATS.OPENAI && item.choices?.[0]) {
              const choice = item.choices[0];
              if (seenFinishReason) {
                // Drop trailing content chunks after finish_reason has already been emitted
                continue;
              }
              if (choice.finish_reason) {
                const finishReason = choice.finish_reason;
                const delta = choice.delta || {};
                const hasContent =
                  (typeof delta.content === "string" && delta.content !== "") ||
                  (typeof delta.reasoning_content === "string" && delta.reasoning_content !== "") ||
                  (typeof delta.reasoning === "string" && delta.reasoning !== "") ||
                  (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0);

                if (hasContent) {
                  choice.finish_reason = null;
                  const output1 = formatSSE(item, sourceFormat);
                  reqLogger?.appendConvertedChunk?.(output1);
                  controller.enqueue(sharedEncoder.encode(output1));
                  sseEmittedCount++;

                  choice.delta = {};
                  choice.finish_reason = finishReason;
                }
                seenFinishReason = true;
              }
            }

            // Inject estimated usage if finish chunk has no valid usage
            const isFinishChunk = item.type === "message_delta" || item.choices?.[0]?.finish_reason;
            if (state.finishReason && isFinishChunk && !hasValidUsage(item.usage) && totalContentLength > 0) {
              const estimated = estimateUsage(body, totalContentLength, sourceFormat);
              item.usage = filterUsageForFormat(estimated, sourceFormat); // Filter + already has buffer
              state.usage = estimated;
            } else if (state.finishReason && isFinishChunk && state.usage) {
              // Add buffer and filter usage for client (but keep original in state.usage for logging)
              const buffered = addBufferToUsage(state.usage);
              item.usage = filterUsageForFormat(buffered, sourceFormat);
            }

            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
            sseEmittedCount++;
          }
        }

        // The completion deferral can outlive the upstream: a broken chat upstream
        // may stall after finish_reason with no usage trailer and no [DONE], holding
        // the connection open. Bound the wait so the client still gets a terminal event.
        if (targetFormat === FORMATS.OPENAI && sourceFormat === FORMATS.OPENAI_RESPONSES &&
            state?.completionPending && !state?.completedSent && !completionFlushTimer) {
          completionFlushTimer = setTimeout(() => {
            completionFlushTimer = null;
            if (state?.completedSent) return;
            try { flushPendingCompletion(controller); } catch { /* controller already closed */ }
          }, PENDING_COMPLETION_FLUSH_MS);
        }
      }
    },

    flush(controller) {
      const evtSummary = Object.entries(eventTypeCounts).map(([k, v]) => `${k}=${v}`).join(",") || "none";
      dbg("SSE", `flush | provider=${provider} | model=${model} | recvLines=${sseLineCount} | emitted=${sseEmittedCount} | events=[${evtSummary}]`);
      trackPendingRequest(model, provider, connectionId, false);
      try {
        const remaining = decoder.decode();
        if (remaining) buffer += remaining;

        if (mode === STREAM_MODE.PASSTHROUGH) {
          // An unterminated trailing "data: [DONE]" is the upstream sentinel: don't
          // forward it raw (it would glue onto the properly framed one appended
          // below, #5592).
          const tail = buffer.trim();
          const tailIsDone = tail.startsWith("data:") && tail.slice(5).trim() === "[DONE]";
          if (!tailIsDone && buffer) {
            let output = buffer;
            if (buffer.startsWith("data:") && !buffer.startsWith("data: ")) {
              output = "data: " + buffer.slice(5);
            }
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }

          // IMPORTANT: In passthrough mode we still must terminate the SSE stream.
          // Some clients (e.g. OpenClaw) expect the OpenAI-style sentinel:
          //   data: [DONE]\n\n
          // Without it they can hang until timeout and trigger failover.
          // Gemini-family clients (Antigravity, Vertex, Gemini) reject this sentinel with 400 syntax errors.
          const isGeminiFamily = provider === "antigravity" || provider === "gemini" || provider === "vertex";
          if (!streamDoneSent && !isGeminiFamily) {
            const doneOutput = "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            controller.enqueue(sharedEncoder.encode(doneOutput));
          }

          finalizeStream();
          return;
        }

        if (buffer.trim()) {
          // Same parse as the transform loop: without targetFormat this only
          // accepts "data: " lines, so an NDJSON provider (Ollama) lost whatever
          // arrived without its closing newline.
          const parsed = parseSSELine(buffer.trim(), targetFormat);
          // parseSSELine turns the SSE sentinel "data: [DONE]" into { done: true },
          // which must not be translated. An Ollama chunk also carries done:true,
          // but it is the real final chunk — it holds finish_reason and the token
          // counts — so it has to go through.
          const isDoneSentinel = parsed?.done && targetFormat !== FORMATS.OLLAMA;
          if (parsed && !isDoneSentinel) {
            // Same accumulation the transform loop does, so finalizeStream() can
            // log a tail chunk's tokens instead of falling back to null.
            const extracted = extractUsage(parsed);
            if (extracted) state.usage = mergeUsage(state.usage, extracted);

            const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

            if (translated?._openaiIntermediate) {
              for (const item of translated._openaiIntermediate) {
                const openaiOutput = formatSSE(item, FORMATS.OPENAI);
                reqLogger?.appendOpenAIChunk?.(openaiOutput);
              }
            }

            if (translated?.length > 0) {
              for (const item of translated) {
                if (item === null || item === undefined) continue;
                const output = formatSSE(item, sourceFormat);
                reqLogger?.appendConvertedChunk?.(output);
                controller.enqueue(sharedEncoder.encode(output));
              }
            }
          }
        }

        const flushed = translateResponse(targetFormat, sourceFormat, null, state);

        if (flushed?._openaiIntermediate) {
          for (const item of flushed._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (flushed?.length > 0) {
          for (const item of flushed) {
            if (item === null || item === undefined) continue;
            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }
        }

        // Synthesize response.failed if a Responses passthrough stream never reached a terminal event
        const keepsOpenAIResponsesFormat = targetFormat === FORMATS.OPENAI_RESPONSES && sourceFormat === FORMATS.OPENAI_RESPONSES;
        if (keepsOpenAIResponsesFormat && !openAIResponsesTerminalSeen) {
          const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
          reqLogger?.appendConvertedChunk?.(failedOutput);
          controller.enqueue(sharedEncoder.encode(failedOutput));
          openAIResponsesTerminalSeen = true;
        }

        if (keepsOpenAIResponsesFormat && !openAIResponsesDoneSent && !streamDoneSent) {
          const doneOutput = "data: [DONE]\n\n";
          reqLogger?.appendConvertedChunk?.(doneOutput);
          controller.enqueue(sharedEncoder.encode(doneOutput));
          openAIResponsesDoneSent = true;
          streamDoneSent = true;
        }

        finalizeStream();
      } catch (error) {
        console.log("Error in flush:", error);
        finalizeStream();
      }
    }
  });
}

export function createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider = null, reqLogger = null, toolNameMap = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, customToolNames = null, credentials = null) {
  return createSSEStream({
    mode: STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider,
    reqLogger,
    toolNameMap,
    customToolNames,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    credentials
  });
}

export function createPassthroughStreamWithLogger(provider = null, reqLogger = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, toolNameMap = null) {
  return createSSEStream({
    mode: STREAM_MODE.PASSTHROUGH,
    provider,
    reqLogger,
    toolNameMap,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey
  });
}

/**
 * Ultra-light zero-allocation Finish Reason Guard for OpenAI streaming chunks.
 * Enforces strict OpenAI streaming specification:
 * 1. Content/reasoning deltas are never emitted in the same chunk as non-null finish_reason.
 * 2. Any trailing content/reasoning tokens received after finish_reason has been emitted are dropped.
 * 3. Minimal CPU footprint for Cloudflare Workers Free Tier (no JSON parsing on regular tokens).
 */
export function createOpenAIFinishGuardStream(onStreamComplete = null) {
  const encoder = sharedEncoder;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let seenFinish = false;
  let doneSent = false;
  const t0 = Date.now();

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        if (trimmed.startsWith("data:")) {
          const dataContent = trimmed.slice(5).trim();

          if (dataContent === "[DONE]") {
            doneSent = true;
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }

          // If finish_reason was already emitted:
          if (seenFinish) {
            // Check if this chunk is a usage-only chunk
            if (dataContent.includes('"usage"') && !dataContent.includes('"content"') && !dataContent.includes('"reasoning_content"') && !dataContent.includes('"tool_calls"')) {
              try {
                const parsed = JSON.parse(dataContent);
                parsed.choices = [];
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
              } catch {
                // Ignore parse errors on trailing chunks
              }
            }
            // Drop any trailing content / reasoning deltas post-finish
            continue;
          }

          // Fast path: if line has finish_reason: null, pass through directly without JSON parse
          if (dataContent.includes('"finish_reason":null') || dataContent.includes('"finish_reason": null')) {
            controller.enqueue(encoder.encode(`data: ${dataContent}\n\n`));
            continue;
          }

          // If line contains finish_reason and it's not null:
          if (dataContent.includes('"finish_reason"')) {
            try {
              const parsed = JSON.parse(dataContent);
              const choice = parsed.choices?.[0];

              if (choice && choice.finish_reason) {
                const finishReason = choice.finish_reason;
                const delta = choice.delta || {};
                const hasContent =
                  (typeof delta.content === "string" && delta.content !== "") ||
                  (typeof delta.reasoning_content === "string" && delta.reasoning_content !== "") ||
                  (typeof delta.reasoning === "string" && delta.reasoning !== "") ||
                  (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0);

                if (hasContent) {
                  // Chunk 1: Content delta with finish_reason: null
                  const contentChunk = {
                    ...parsed,
                    choices: [{
                      ...choice,
                      finish_reason: null
                    }]
                  };
                  delete contentChunk.usage;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));

                  // Chunk 2: Clean terminal finish chunk with empty delta
                  const finishChunk = {
                    ...parsed,
                    choices: [{
                      ...choice,
                      delta: {},
                      finish_reason: finishReason
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
                } else {
                  // No content in this chunk, emit as-is
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                }

                seenFinish = true;
                continue;
              }
            } catch {
              // If JSON.parse fails, pass line through
            }
          }

          // Any other data chunk
          controller.enqueue(encoder.encode(`data: ${dataContent}\n\n`));
        } else {
          controller.enqueue(encoder.encode(`${trimmed}\n\n`));
        }
      }
    },

    flush(controller) {
      if (buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith("data:") && line.slice(5).trim() === "[DONE]") {
          doneSent = true;
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      }
      if (!doneSent) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
      if (onStreamComplete) {
        try {
          onStreamComplete({ content: "", thinking: null }, null, t0);
        } catch {}
      }
    }
  });
}
