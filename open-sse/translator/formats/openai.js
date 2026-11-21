// OpenAI helper functions for translator
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, VALID_OPENAI_CONTENT_TYPES, VALID_OPENAI_MESSAGE_TYPES } from "../schema/index.js";

// Re-export valid-type lists (moved to schema/blocks.js) to keep existing importers working.
export { VALID_OPENAI_CONTENT_TYPES, VALID_OPENAI_MESSAGE_TYPES };

// Filter messages to OpenAI standard format
// Remove: thinking, redacted_thinking, signature, and other non-OpenAI blocks
// opts.preserveCacheControl: keep cache_control on content blocks (e.g. for DashScope/alicode)
export function filterToOpenAIFormat(body, opts = {}) {
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) return body;
  const keepCache = !!opts.preserveCacheControl;

  function stripBlock(block) {
    const { signature, cache_control, ...rest } = block;
    return keepCache && cache_control ? { ...rest, cache_control } : rest;
  }

  // Fast check: verify if any message or tool actually requires transformation.
  // In standard OpenAI -> OpenAI conversations, messages are already strings and tools are functions.
  // This early-exit bypasses thousands of allocations on multi-turn conversations.
  let needsMessageClean = false;
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (!msg || msg.role === ROLE.DEVELOPER || Array.isArray(msg.content)) {
      needsMessageClean = true;
      break;
    }
    if (typeof msg.content === "string") {
      if (!/\S/.test(msg.content) && msg.role !== ROLE.TOOL && !(msg.role === ROLE.ASSISTANT && msg.tool_calls)) {
        needsMessageClean = true;
        break;
      }
    } else if (msg.role !== ROLE.TOOL && !(msg.role === ROLE.ASSISTANT && msg.tool_calls)) {
      needsMessageClean = true;
      break;
    }
  }

  const hasEmptyTools = body.tools && Array.isArray(body.tools) && body.tools.length === 0;
  const toolsNeedClean = body.tools && Array.isArray(body.tools) && body.tools.length > 0 &&
    body.tools.some(tool => !(tool.type === OPENAI_BLOCK.FUNCTION && tool.function));
  const toolChoiceNeedsClean = body.tool_choice && typeof body.tool_choice === "object";

  if (!needsMessageClean && !hasEmptyTools && !toolsNeedClean && !toolChoiceNeedsClean) {
    return body;
  }

  // Single-pass message cleaning and filtering
  if (needsMessageClean) {
    const cleanedMessages = [];
    for (let i = 0; i < body.messages.length; i++) {
      let msg = body.messages[i];
      if (!msg) continue;

      // Normalize developer role to system (many providers don't support developer)
      if (msg.role === ROLE.DEVELOPER) msg = { ...msg, role: ROLE.SYSTEM };

      // Keep tool messages as-is (OpenAI format)
      if (msg.role === ROLE.TOOL) {
        cleanedMessages.push(msg);
        continue;
      }

      // Keep assistant messages with tool_calls as-is
      if (msg.role === ROLE.ASSISTANT && msg.tool_calls) {
        cleanedMessages.push(msg);
        continue;
      }

      // Handle string content: only keep if non-empty
      if (typeof msg.content === "string") {
        if (/\S/.test(msg.content)) {
          cleanedMessages.push(msg);
        }
        continue;
      }

      // Handle array content
      if (Array.isArray(msg.content)) {
        const filteredContent = [];

        for (const block of msg.content) {
          // Skip thinking blocks
          if (block.type === CLAUDE_BLOCK.THINKING || block.type === CLAUDE_BLOCK.REDACTED_THINKING) continue;

          // Only keep valid OpenAI content types
          if (VALID_OPENAI_CONTENT_TYPES.includes(block.type)) {
            filteredContent.push(stripBlock(block));
          } else if (block.type === CLAUDE_BLOCK.TOOL_USE) {
            // Convert tool_use to tool_calls format (handled separately)
            continue;
          } else if (block.type === CLAUDE_BLOCK.TOOL_RESULT) {
            // Keep tool_result but clean it
            filteredContent.push(stripBlock(block));
          }
        }

        // If all content was filtered, add empty text
        if (filteredContent.length === 0) {
          filteredContent.push({ type: OPENAI_BLOCK.TEXT, text: "" });
        }

        const hasNonEmpty = filteredContent.some(b =>
          (b.type === OPENAI_BLOCK.TEXT && /\S/.test(b.text || "")) ||
          b.type !== OPENAI_BLOCK.TEXT
        );

        if (hasNonEmpty) {
          cleanedMessages.push({ ...msg, content: filteredContent });
        }
        continue;
      }

      cleanedMessages.push(msg);
    }
    body.messages = cleanedMessages;
  }

  // Remove empty tools array (some providers like QWEN reject it)
  if (body.tools && Array.isArray(body.tools) && body.tools.length === 0) {
    delete body.tools;
  }

  // Normalize tools to OpenAI format (from Claude, Gemini, etc.)
  if (toolsNeedClean && body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    body.tools = body.tools.map(tool => {
      // Already OpenAI format
      if (tool.type === OPENAI_BLOCK.FUNCTION && tool.function) return tool;

      // Claude format: {name, description, input_schema}
      if (tool.name && (tool.input_schema || tool.description)) {
        return {
          type: OPENAI_BLOCK.FUNCTION,
          function: {
            name: tool.name,
            description: String(tool.description || ""),
            parameters: tool.input_schema || { type: "object", properties: {} }
          }
        };
      }

      // Gemini format: {functionDeclarations: [{name, description, parameters}]}
      if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
        return tool.functionDeclarations.map(fn => ({
          type: OPENAI_BLOCK.FUNCTION,
          function: {
            name: fn.name,
            description: String(fn.description || ""),
            parameters: fn.parameters || { type: "object", properties: {} }
          }
        }));
      }

      return tool;
    }).flat();
  }

  // Normalize tool_choice to OpenAI format
  if (body.tool_choice && typeof body.tool_choice === "object") {
    const choice = body.tool_choice;
    // Claude format: {type: "auto|any|tool", name?: "..."}
    if (choice.type === "auto") {
      body.tool_choice = "auto";
    } else if (choice.type === "any") {
      body.tool_choice = "required";
    } else if (choice.type === "tool" && choice.name) {
      body.tool_choice = { type: OPENAI_BLOCK.FUNCTION, function: { name: choice.name } };
    }
  }

  return body;
}

