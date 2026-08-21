import { describe, expect, it } from "vitest";
import { planSequentialWorkflow } from "./workflowRunService";

describe("sequential workflow planner", () => {
  it("orders connected agent nodes so upstream outputs are available before downstream runs", () => {
    const plan = planSequentialWorkflow({
      nodes: [
        { id: "source", data: { agentId: "agent-a" } },
        { id: "transform", data: { agentId: "agent-b" } },
        { id: "synthesize", data: { agentId: "agent-c" } },
      ],
      edges: [
        { id: "a-b", source: "source", target: "transform" },
        { id: "b-c", source: "transform", target: "synthesize" },
      ],
    });

    expect(plan.map(node => node.id)).toEqual(["source", "transform", "synthesize"]);
  });

  it("rejects cyclic graphs before any inference work begins", () => {
    expect(() =>
      planSequentialWorkflow({
        nodes: [
          { id: "a", data: { agentId: "agent-a" } },
          { id: "b", data: { agentId: "agent-b" } },
        ],
        edges: [
          { id: "a-b", source: "a", target: "b" },
          { id: "b-a", source: "b", target: "a" },
        ],
      }),
    ).toThrow("cannot contain cycles");
  });
});
