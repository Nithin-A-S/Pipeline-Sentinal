import { ApiError, apiClient } from "./apiClient";
import type { ChatMessage, ChatToolCall } from "@/types";

function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface ChatService {
  sendMessage(content: string): Promise<{ toolCalls: ChatToolCall[]; reply: ChatMessage }>;
}

/**
 * Response of the AI DataOps Assistant's `POST /api/chat`:
 *   request  { "message": "<question>" }
 *   response { "success": true, "data": { "role": "assistant", "message": "<answer>" } }
 * Errors come back as FastAPI `{ "detail": "..." }` — 400 for an empty message, 500 when the agent fails.
 */
interface ChatEnvelope {
  success: boolean;
  data?: { role: "assistant"; message: string };
}

/** Turns a failed call into a message the user can act on. */
function errorText(e: unknown): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return "Genie took too long to answer. Please try again with a shorter question.";
  }
  if (!(e instanceof ApiError)) return "Genie could not answer that right now. Please try again.";
  switch (e.status) {
    case 400:
      return "Please type a question for Genie.";
    case 401:
    case 403:
      return "Genie is not authorised in this environment — check the Databricks token and CAN_USE permission on the assistant app.";
    case 503:
      return "Genie is not connected in this environment yet.";
    case 502:
    case 504:
      return "Genie is not reachable right now. The assistant service may be stopped or restarting — please try again in a minute.";
    default:
      return "Genie could not answer that right now. Please try again.";
  }
}

/**
 * Genie is the only live integration in this app: every message is a POST to
 * the AI DataOps Assistant's /api/chat (through this app's own server-side
 * proxy, so the browser never holds a Databricks credential).
 * Everything else in the UI is static demo data.
 */
class GenieChatService implements ChatService {
  async sendMessage(content: string): Promise<{ toolCalls: ChatToolCall[]; reply: ChatMessage }> {
    const message = content.trim();
    const toolCalls: ChatToolCall[] = [{ label: "Asking Genie", status: "done" }];
    let text: string;
    if (!message) {
      text = "Please type a question for Genie.";
    } else {
      try {
        const res = await apiClient.post<ChatEnvelope>("/api/chat", { message });
        text = res.success && res.data?.message ? res.data.message : "Genie returned an empty answer. Please try rephrasing the question.";
      } catch (e) {
        if (e instanceof ApiError && e.detail) console.error("[genie]", e.status, e.detail);
        text = errorText(e);
      }
    }
    return {
      toolCalls,
      reply: { id: id(), role: "assistant", content: text, timestamp: new Date().toISOString() },
    };
  }
}

export const chatService: ChatService = new GenieChatService();
