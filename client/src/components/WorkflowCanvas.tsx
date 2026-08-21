import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

type AgentSummary = {
  id: string;
  name: string;
  modelPreference: string;
  status: "enabled" | "disabled";
};

type WorkflowGraph = { nodes: Node[]; edges: Edge[] };

export type WorkflowCanvasProps = {
  agents: AgentSummary[];
  workflowId?: string;
  graph?: unknown;
  onGraphChange: (graph: WorkflowGraph) => void;
};

type AgentNodeData = {
  label?: string;
  agentName?: string;
  modelPreference?: string;
  status?: string;
};

function AgentNode({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  return (
    <div className={`agent-flow-node ${selected ? "agent-flow-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="agent-flow-node__topline">
        <Bot size={15} strokeWidth={2.5} />
        <span>AGENT</span>
      </div>
      <strong>{data.agentName || data.label || "Untitled node"}</strong>
      <div className="agent-flow-node__meta">
        <span>{data.modelPreference || "auto"}</span>
        <span className={data.status === "disabled" ? "flow-status flow-status--off" : "flow-status"}>
          {data.status || "enabled"}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

const decodeGraph = (value: unknown): WorkflowGraph => {
  if (!value || typeof value !== "object") return { nodes: [], edges: [] };
  const graph = value as Partial<WorkflowGraph>;
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
  };
};

export default function WorkflowCanvas({ agents, workflowId, graph, onGraphChange }: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flowInstance = useRef<Parameters<NonNullable<React.ComponentProps<typeof ReactFlow>["onInit"]>>[0] | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = decodeGraph(graph);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [workflowId, setEdges, setNodes]);

  useEffect(() => {
    onGraphChange({ nodes, edges });
  }, [edges, nodes, onGraphChange]);

  const onConnect = useCallback(
    (connection: Parameters<NonNullable<React.ComponentProps<typeof ReactFlow>["onConnect"]>>[0]) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      setEdges(current => [
        ...current,
        {
          id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          type: "straight",
          animated: false,
        },
      ]);
    },
    [setEdges],
  );

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, agent: AgentSummary) => {
    event.dataTransfer.setData("application/swarmline-agent", JSON.stringify(agent));
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/swarmline-agent");
      if (!raw || !flowInstance.current) return;
      const agent = JSON.parse(raw) as AgentSummary;
      const position = flowInstance.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes(current => [
        ...current,
        {
          id: `node-${agent.id}-${Date.now()}`,
          type: "agent",
          position,
          data: {
            agentId: agent.id,
            agentName: agent.name,
            label: agent.name,
            modelPreference: agent.modelPreference,
            status: agent.status,
          },
        },
      ]);
    },
    [setNodes],
  );

  const activeAgents = useMemo(() => agents.filter(agent => agent.status === "enabled"), [agents]);

  return (
    <div className="workflow-layout">
      <aside className="workflow-palette" aria-label="Available agents">
        <div className="section-kicker">NODE LIBRARY</div>
        <h3>DRAG AN AGENT</h3>
        <p>Drop enabled tenant agents onto the grid. Connect their ports to define directed hand-offs.</p>
        <div className="workflow-palette__stack">
          {activeAgents.map(agent => (
            <div
              key={agent.id}
              className="palette-agent"
              draggable
              onDragStart={event => onDragStart(event, agent)}
              role="button"
              tabIndex={0}
            >
              <GripVertical size={16} />
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.modelPreference}</small>
              </span>
              <Plus size={15} />
            </div>
          ))}
          {activeAgents.length === 0 ? <div className="empty-grid-note">Create and enable an agent to populate the node library.</div> : null}
        </div>
      </aside>
      <div
        ref={canvasRef}
        className="workflow-canvas"
        onDrop={onDrop}
        onDragOver={event => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={instance => {
            flowInstance.current = instance;
          }}
          fitView
          minZoom={0.35}
          maxZoom={1.6}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#3a3a3a" gap={28} size={1} />
          <Controls showInteractive={false} />
          <MiniMap nodeColor="#E30613" maskColor="rgba(0,0,0,0.65)" />
        </ReactFlow>
        <div className="canvas-coordinates">X: 0042 / Y: 0091 / GRID: 28</div>
      </div>
    </div>
  );
}
