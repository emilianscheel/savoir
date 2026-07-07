/**
 * Nebius / OpenAI-compatible LLM client types.
 * Server-side enrichment and bot answers run in Butterbase functions (see butterbase/shared/runtime.ts).
 */

export interface NebiusConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface ChatCompletionResponse {
  content: string;
}

/** Browser-safe stub — production calls go through Butterbase functions. */
export async function chatCompletion(
  _config: NebiusConfig,
  _request: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  return {
    content: "LLM calls run server-side in Butterbase functions. Configure NEBIUS_API_KEY there.",
  };
}

export function defaultNebiusConfig(): NebiusConfig | null {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1",
    model: process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.7-Code",
  };
}
