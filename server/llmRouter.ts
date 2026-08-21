import { invokeLLM, listLLMModels, type InvokeResult, type ModelInfo } from "./_core/llm";
import {
  createModelSelection,
  updateModelSelectionLatency,
} from "./orchestrationDb";

type PriceRate = { input: number; output: number; baselineLatencyMs: number };

const priceBook: Record<string, PriceRate> = {
  "gpt-5-nano": { input: 0.05, output: 0.4, baselineLatencyMs: 420 },
  "gpt-5-mini": { input: 0.25, output: 2, baselineLatencyMs: 640 },
  "gpt-5": { input: 1.25, output: 10, baselineLatencyMs: 990 },
  "gpt-5.5": { input: 5, output: 30, baselineLatencyMs: 1450 },
  "claude-haiku-4-5": { input: 1, output: 5, baselineLatencyMs: 560 },
  "claude-sonnet-4-6": { input: 3, output: 15, baselineLatencyMs: 900 },
  "claude-opus-4-6": { input: 5, output: 25, baselineLatencyMs: 1500 },
  "claude-opus-4-7": { input: 5, output: 25, baselineLatencyMs: 1420 },
  "gemini-3-flash-preview": { input: 0.5, output: 3, baselineLatencyMs: 520 },
  "gemini-3.1-pro-preview": { input: 2, output: 12, baselineLatencyMs: 1050 },
};

const latencyEwma = new Map<string, number>();

export type ModelRoute = {
  modelId: string;
  provider: string;
  estimatedInputCostMicros: number;
  estimatedOutputCostMicros: number;
  predictedLatencyMs: number;
  compositeScore: number;
};

const providerFor = (modelId: string) => {
  if (modelId.startsWith("claude-")) return "Claude";
  if (modelId.startsWith("deepseek-")) return "DeepSeek";
  if (modelId.startsWith("llama-")) return "Llama";
  if (modelId.startsWith("gemini-")) return "Gemini";
  if (modelId.startsWith("gpt-")) return "OpenAI";
  return "External";
};

const pricingFor = (modelId: string): PriceRate =>
  priceBook[modelId] ?? { input: 2.5, output: 12, baselineLatencyMs: 980 };

const approximatePromptTokens = (prompt: string) => Math.max(1, Math.ceil(prompt.length / 4));

export function estimateModelCost(modelId: string, promptTokens: number, outputTokens = 512) {
  const rates = pricingFor(modelId);
  return {
    inputMicros: Math.round(rates.input * promptTokens),
    outputMicros: Math.round(rates.output * outputTokens),
  };
}

export function scoreModelRoutes(models: ModelInfo[], prompt: string, preference = "auto"): ModelRoute[] {
  const available = models.filter(model => preference === "auto" || model.id === preference);
  const candidates = available.length > 0 ? available : models;
  const promptTokens = approximatePromptTokens(prompt);

  const unscored = candidates.map(model => {
    const cost = estimateModelCost(model.id, promptTokens);
    const rates = pricingFor(model.id);
    const historicalLatency = latencyEwma.get(model.id) ?? rates.baselineLatencyMs;
    const transientNetworkPressure = 0.88 + ((Date.now() / 1000 + model.id.length * 13) % 17) / 100;
    return {
      modelId: model.id,
      provider: providerFor(model.id),
      estimatedInputCostMicros: cost.inputMicros,
      estimatedOutputCostMicros: cost.outputMicros,
      predictedLatencyMs: Math.round(historicalLatency * transientNetworkPressure),
    };
  });

  const maxCost = Math.max(...unscored.map(route => route.estimatedInputCostMicros + route.estimatedOutputCostMicros), 1);
  const maxLatency = Math.max(...unscored.map(route => route.predictedLatencyMs), 1);

  return unscored
    .map(route => ({
      ...route,
      compositeScore: Math.round(
        ((route.estimatedInputCostMicros + route.estimatedOutputCostMicros) / maxCost) * 580 +
          (route.predictedLatencyMs / maxLatency) * 420,
      ),
    }))
    .sort((a, b) => a.compositeScore - b.compositeScore);
}

export async function runRoutedInference(input: {
  tenantId: string;
  executionId: string;
  prompt: string;
  systemPrompt: string;
  preference: string;
}) {
  const catalog = await listLLMModels();
  const routes = scoreModelRoutes(catalog.data, input.prompt, input.preference);
  const route = routes[0];
  if (!route) throw new Error("No language model is available for routing.");

  const selectionId = await createModelSelection({
    tenantId: input.tenantId,
    executionId: input.executionId,
    modelId: route.modelId,
    provider: route.provider,
    compositeScore: route.compositeScore,
    estimatedInputCostMicros: route.estimatedInputCostMicros,
    estimatedOutputCostMicros: route.estimatedOutputCostMicros,
  });

  const startedAt = Date.now();
  try {
    const result: InvokeResult = await invokeLLM({
      model: route.modelId,
      ...(route.modelId.startsWith("gpt-") ? { max_completion_tokens: 1200 } : { max_tokens: 1200 }),
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.prompt },
      ],
    });
    const observedLatencyMs = Date.now() - startedAt;
    const previous = latencyEwma.get(route.modelId) ?? route.predictedLatencyMs;
    latencyEwma.set(route.modelId, Math.round(previous * 0.65 + observedLatencyMs * 0.35));
    await updateModelSelectionLatency(selectionId, observedLatencyMs);

    const content = result.choices[0]?.message.content;
    const output = typeof content === "string" ? content : JSON.stringify(content ?? "");
    const promptTokens = result.usage?.prompt_tokens ?? approximatePromptTokens(input.prompt);
    const completionTokens = result.usage?.completion_tokens ?? approximatePromptTokens(output);
    const usageCost = estimateModelCost(route.modelId, promptTokens, completionTokens);

    return {
      output,
      route,
      observedLatencyMs,
      promptTokens,
      completionTokens,
      totalTokens: result.usage?.total_tokens ?? promptTokens + completionTokens,
      estimatedCostMicros: usageCost.inputMicros + usageCost.outputMicros,
    };
  } catch (error) {
    const observedLatencyMs = Date.now() - startedAt;
    latencyEwma.set(route.modelId, observedLatencyMs);
    await updateModelSelectionLatency(selectionId, observedLatencyMs);
    throw error;
  }
}
