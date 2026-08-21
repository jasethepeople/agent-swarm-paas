import { describe, expect, it } from "vitest";
import { evaluateAlerts } from "./alertService";

describe("alert threshold evaluation", () => {
  it("raises visual alert signals for cost, latency, and failure threshold breaches", () => {
    const alerts = evaluateAlerts({
      settings: { enabled: true, maxExecutionCostMicros: 50_000, maxLatencyMs: 1_000, maxFailures: 1 },
      executions: [
        { id: "expensive", estimatedCostMicros: 75_000, status: "completed" },
        { id: "failed", estimatedCostMicros: 10, status: "failed" },
      ],
      selections: [{ executionId: "expensive", observedLatencyMs: 1_200 }],
    });

    expect(alerts.map(alert => alert.type)).toEqual(["cost", "latency", "failure"]);
  });

  it("suppresses alert signals when the tenant disarms thresholds", () => {
    const alerts = evaluateAlerts({
      settings: { enabled: false, maxExecutionCostMicros: 1, maxLatencyMs: 1, maxFailures: 1 },
      executions: [{ id: "run", estimatedCostMicros: 99, status: "failed" }],
      selections: [{ executionId: "run", observedLatencyMs: 99 }],
    });
    expect(alerts).toEqual([]);
  });
});
