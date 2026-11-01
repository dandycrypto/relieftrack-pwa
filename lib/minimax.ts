/**
 * lib/minimax.ts — compatibility shim.
 *
 * The MiniMax provider this module was written for is unusable: its configured
 * model was retired (HTTP 404) and every remaining model on the key returns
 * HTTP 402 insufficient balance, which broke the AI assistant for all users.
 *
 * The implementation now lives in lib/llm.ts and is provider-agnostic. This
 * file stays so existing imports (app/api/ai-chat, OCR extraction) keep working.
 */
export {
  callLLM as callMiniMax,
  LLMError as MiniMaxError,
  type LLMMessage as MiniMaxMessage,
} from "./llm"
