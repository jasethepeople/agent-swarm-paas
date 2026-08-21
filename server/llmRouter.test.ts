import { describe, expect, it } from "vitest";
import { scoreModelRoutes } from "./llmRouter";

const models = [
  { id: "claude-haiku-4-5", object: "model", created: 0, owned_by: "anthropic" },
  { id: "gpt-5-mini", object: "model", created: 0, owned_by: "openai" },
  { id: "gpt-5", object: "model", created: 0, owned_by: "openai" },
];

describe("dynamic LLM routing", () => {
  it("sorts real available models by a combined cost and latency score", () => {
    const routes = scoreModelRoutes(models, "Summarize this operational event into a concise next action.");

    expect(routes).toHaveLength(3);
    expect(routes[0].compositeScore).toBeLessThanOrEqual(routes[1].compositeScore);
    expect(routes[1].compositeScore).toBeLessThanOrEqual(routes[2].compositeScore);
    expect(routes.every(route => route.estimatedInputCostMicros > 0)).toBe(true);
    expect(routes.every(route => route.predictedLatencyMs > 0)).toBe(true);
  });

  it("honors an available explicit model preference without inventing a model ID", () => {
    const routes = scoreModelRoutes(models, "Inspect current agent state.", "gpt-5");

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ modelId: "gpt-5", provider: "OpenAI" });
  });
});
