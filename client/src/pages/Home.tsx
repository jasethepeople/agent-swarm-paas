import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Braces,
  ChevronDown,
  CircleDot,
  Command,
  Cpu,
  Database,
  Gauge,
  Layers3,
  Loader2,
  LogOut,
  Network,
  Plus,
  Radio,
  Save,
  Send,
  Terminal,
  Trash2,
  UserRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type WorkspaceView = "overview" | "workflow" | "agents" | "traces";
type GraphDraft = { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };

const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

const navItems: Array<{ id: WorkspaceView; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "CONTROL ROOM", icon: Gauge },
  { id: "workflow", label: "SWARM GRAPH", icon: Network },
  { id: "agents", label: "AGENT REGISTRY", icon: Bot },
  { id: "traces", label: "TRACE ARCHIVE", icon: Terminal },
];

const emptyGraph: GraphDraft = { nodes: [], edges: [] };

function MetricCell({ label, value, sublabel, accent = false }: { label: string; value: string; sublabel: string; accent?: boolean }) {
  return (
    <div className={`metric-cell ${accent ? "metric-cell--accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sublabel}</small>
    </div>
  );
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export default function Home() {
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [tenantId, setTenantId] = useState<string>("");
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("You are a precise autonomous agent. Return a concise, actionable response.");
  const [agentDescription, setAgentDescription] = useState("");
  const [workflowName, setWorkflowName] = useState("Untitled swarm graph");
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | undefined>();
  const [graphDraft, setGraphDraft] = useState<GraphDraft>(emptyGraph);
  const [runAgentId, setRunAgentId] = useState("");
  const [runPrompt, setRunPrompt] = useState("Analyze the current orchestration objective and return the next operational action.");
  const [latestOutput, setLatestOutput] = useState("");

  const tenantsQuery = trpc.orchestration.workspace.listTenants.useQuery(undefined, { enabled: !!user });
  const activeTenant = useMemo(() => tenantsQuery.data?.find(tenant => tenant.id === tenantId), [tenantId, tenantsQuery.data]);
  const gatewayInput = { tenantId };
  const queryEnabled = Boolean(user && tenantId);
  const agentsQuery = trpc.orchestration.agents.list.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 10_000 });
  const workflowsQuery = trpc.orchestration.workflows.list.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 10_000 });
  const observabilityQuery = trpc.orchestration.observability.snapshot.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 5_000 });

  useEffect(() => {
    if (!tenantId && tenantsQuery.data?.[0]) setTenantId(tenantsQuery.data[0].id);
  }, [tenantId, tenantsQuery.data]);

  useEffect(() => {
    if (!runAgentId && agentsQuery.data?.[0]) setRunAgentId(agentsQuery.data[0].id);
  }, [agentsQuery.data, runAgentId]);

  const createAgent = trpc.orchestration.agents.create.useMutation({
    onSuccess: async () => {
      await utils.orchestration.agents.list.invalidate(gatewayInput);
      setAgentName("");
      setAgentDescription("");
      setIsAgentFormOpen(false);
      toast.success("Agent registered in this tenant.");
    },
    onError: error => toast.error(error.message),
  });

  const updateAgent = trpc.orchestration.agents.update.useMutation({
    onSuccess: () => utils.orchestration.agents.list.invalidate(gatewayInput),
    onError: error => toast.error(error.message),
  });

  const deleteAgent = trpc.orchestration.agents.delete.useMutation({
    onSuccess: () => {
      utils.orchestration.agents.list.invalidate(gatewayInput);
      toast.success("Agent removed from the registry.");
    },
    onError: error => toast.error(error.message),
  });

  const saveWorkflow = trpc.orchestration.workflows.save.useMutation({
    onSuccess: async workflow => {
      setActiveWorkflowId(workflow?.id);
      await utils.orchestration.workflows.list.invalidate(gatewayInput);
      toast.success("Tenant workflow graph saved.");
    },
    onError: error => toast.error(error.message),
  });

  const deleteWorkflow = trpc.orchestration.workflows.delete.useMutation({
    onSuccess: () => {
      setActiveWorkflowId(undefined);
      setWorkflowName("Untitled swarm graph");
      setGraphDraft(emptyGraph);
      utils.orchestration.workflows.list.invalidate(gatewayInput);
      toast.success("Workflow graph removed.");
    },
    onError: error => toast.error(error.message),
  });

  const runAgent = trpc.orchestration.executions.runAgent.useMutation({
    onSuccess: async result => {
      setLatestOutput(result.output);
      await utils.orchestration.observability.snapshot.invalidate(gatewayInput);
      toast.success(`Inference completed through ${result.route.modelId}.`);
    },
    onError: error => toast.error(error.message),
  });

  const registerAgent = () => {
    if (!tenantId || agentName.trim().length < 2 || agentPrompt.trim().length < 10) return;
    createAgent.mutate({
      tenantId,
      name: agentName.trim(),
      description: agentDescription.trim() || undefined,
      systemPrompt: agentPrompt.trim(),
      modelPreference: "auto",
    });
  };

  const selectWorkflow = (workflow: NonNullable<typeof workflowsQuery.data>[number]) => {
    setActiveWorkflowId(workflow.id);
    setWorkflowName(workflow.name);
    setGraphDraft((workflow.graph as GraphDraft) || emptyGraph);
  };

  const isTenantAdmin = activeTenant?.membershipRole === "admin";
  const agents = agentsQuery.data ?? [];
  const snapshot = observabilityQuery.data;

  if (loading || tenantsQuery.isLoading) {
    return <div className="system-loader"><Loader2 size={24} className="spin" /> INITIALIZING TENANT COMMAND SURFACE</div>;
  }

  if (!user) {
    return (
      <main className="login-gate construct-grid">
        <div className="login-gate__mark">SWARMLINE / 01</div>
        <div className="login-gate__content">
          <div className="section-kicker">SECURE AGENT ORCHESTRATION</div>
          <h1>ENTER THE<br /><span>CONTROL ROOM.</span></h1>
          <p>Tenant-bound access is required before workflows, agent specifications, and inference traces can be opened.</p>
          <button className="construct-button construct-button--solid" onClick={() => startLogin()}>
            AUTHENTICATE <ArrowUpRight size={17} />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell construct-grid">
      <aside className="command-rail">
        <div className="brand-block">
          <div className="brand-mark"><Command size={21} /></div>
          <div><strong>SWARMLINE</strong><span>PAAS / COMMAND SYSTEM</span></div>
        </div>
        <div className="rail-rule" />
        <nav className="main-nav" aria-label="Platform sections">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeView === item.id ? "nav-item nav-item--active" : "nav-item"} onClick={() => setActiveView(item.id)}>
                <Icon size={17} /><span>{item.label}</span><i>0{navItems.indexOf(item) + 1}</i>
              </button>
            );
          })}
        </nav>
        <div className="rail-bottom">
          <div className="operator-card"><UserRound size={18} /><span><strong>{user.name || "OPERATOR"}</strong><small>{user.role.toUpperCase()} / AUTHENTICATED</small></span></div>
          <button className="logout-button" onClick={logout}><LogOut size={16} /> TERMINATE SESSION</button>
        </div>
      </aside>

      <section className="command-stage">
        <header className="topbar">
          <div className="topbar__context">
            <span className="live-dot" />
            <span>GATEWAY ONLINE</span>
            <span className="topbar__slash">/</span>
            <span>JWT VERIFIED</span>
          </div>
          <div className="tenant-switcher">
            <Database size={15} />
            <select aria-label="Active tenant" value={tenantId} onChange={event => setTenantId(event.target.value)}>
              {tenantsQuery.data?.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name.toUpperCase()}</option>)}
            </select>
            <ChevronDown size={15} />
          </div>
        </header>

        <section className="headline-band">
          <div>
            <div className="section-kicker">TENANT / {activeTenant?.slug || "SYNCING"}</div>
            <h1>{activeView === "overview" ? "COMMAND ROOM" : activeView === "workflow" ? "SWARM GRAPH" : activeView === "agents" ? "AGENT REGISTRY" : "TRACE ARCHIVE"}</h1>
          </div>
          <div className="headline-band__signal"><Radio size={16} /> LIVE DATA / 5S REFRESH</div>
        </section>

        {activeView === "overview" ? (
          <section className="content-grid overview-grid">
            <div className="metric-strip">
              <MetricCell label="TOTAL TOKENS" value={numberFormat.format(snapshot?.usage.totalTokens || 0)} sublabel="TENANT LIFETIME" accent />
              <MetricCell label="EXECUTIONS" value={numberFormat.format(snapshot?.usage.totalExecutions || 0)} sublabel="PERSISTED RUNS" />
              <MetricCell label="EST. INFERENCE COST" value={currencyFormat.format((snapshot?.usage.totalCostMicros || 0) / 1_000_000)} sublabel="ROUTER ESTIMATE" />
              <MetricCell label="LIVE AGENTS" value={numberFormat.format(agents.filter(agent => agent.status === "enabled").length)} sublabel="ENABLED / TENANT" />
            </div>

            <section className="panel execution-console">
              <div className="panel-heading"><span><Zap size={16} /> EXECUTION CONSOLE</span><span className="panel-index">LIVE / REAL INFERENCE</span></div>
              <div className="execution-console__body">
                <div className="field-row">
                  <label>AGENT</label>
                  <select value={runAgentId} onChange={event => setRunAgentId(event.target.value)}>
                    {agents.map(agent => <option key={agent.id} value={agent.id} disabled={agent.status === "disabled"}>{agent.name.toUpperCase()} / {agent.status.toUpperCase()}</option>)}
                  </select>
                </div>
                <textarea value={runPrompt} onChange={event => setRunPrompt(event.target.value)} placeholder="Enter an operational objective for a tenant agent." />
                <button
                  className="construct-button construct-button--solid"
                  disabled={!runAgentId || runAgent.isPending}
                  onClick={() => runAgent.mutate({ tenantId, agentId: runAgentId, prompt: runPrompt, workflowId: activeWorkflowId })}
                >
                  {runAgent.isPending ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {runAgent.isPending ? "ROUTING INFERENCE" : "EXECUTE AGENT"}
                </button>
              </div>
              <div className="execution-output">
                <div className="terminal-label"><Braces size={14} /> LATEST RESPONSE</div>
                <pre>{latestOutput || "No execution response captured. Select a registered agent, issue an objective, then route a real completion through the gateway."}</pre>
              </div>
            </section>

            <section className="panel selection-panel">
              <div className="panel-heading"><span><Cpu size={16} /> MODEL SELECTION LEDGER</span><span className="panel-index">COST + LATENCY</span></div>
              <div className="selection-list">
                {snapshot?.selectionHistory.length ? snapshot.selectionHistory.slice(0, 7).map(selection => (
                  <div className="selection-row" key={selection.id}>
                    <div><strong>{selection.provider}</strong><span>{selection.modelId}</span></div>
                    <div><span>SCORE</span><strong>{selection.compositeScore}</strong></div>
                    <div><span>LATENCY</span><strong>{selection.observedLatencyMs ? `${selection.observedLatencyMs}MS` : "PENDING"}</strong></div>
                  </div>
                )) : <div className="empty-grid-note">No model has been selected for this tenant. Run an enabled agent to populate the live ledger.</div>}
              </div>
            </section>

            <section className="panel trace-panel">
              <div className="panel-heading"><span><Activity size={16} /> EXECUTION SIGNALS</span><button onClick={() => setActiveView("traces")}>OPEN ARCHIVE <ArrowUpRight size={13} /></button></div>
              <div className="trace-mini-list">
                {snapshot?.traces.length ? snapshot.traces.slice(0, 8).map(trace => (
                  <div className={`trace-row trace-row--${trace.level}`} key={trace.id}>
                    <time>{formatTime(trace.createdAt)}</time><span>{trace.eventType}</span><p>{trace.message}</p>
                  </div>
                )) : <div className="empty-grid-note">Trace capture begins when an agent execution is issued.</div>}
              </div>
            </section>
          </section>
        ) : null}

        {activeView === "workflow" ? (
          <section className="workflow-view">
            <div className="workflow-toolbar">
              <div className="workflow-toolbar__title"><Workflow size={18} /><input value={workflowName} onChange={event => setWorkflowName(event.target.value)} aria-label="Workflow name" /></div>
              <div className="workflow-toolbar__actions">
                <select value={activeWorkflowId || "new"} onChange={event => {
                  const value = event.target.value;
                  if (value === "new") { setActiveWorkflowId(undefined); setWorkflowName("Untitled swarm graph"); setGraphDraft(emptyGraph); }
                  else { const selected = workflowsQuery.data?.find(workflow => workflow.id === value); if (selected) selectWorkflow(selected); }
                }}>
                  <option value="new">NEW GRAPH</option>
                  {workflowsQuery.data?.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name.toUpperCase()}</option>)}
                </select>
                <button className="construct-button" onClick={() => saveWorkflow.mutate({ tenantId, workflowId: activeWorkflowId, name: workflowName, graph: graphDraft as any })} disabled={!isTenantAdmin || saveWorkflow.isPending}>
                  <Save size={15} /> SAVE GRAPH
                </button>
                {activeWorkflowId ? <button className="icon-button danger" onClick={() => deleteWorkflow.mutate({ tenantId, workflowId: activeWorkflowId })} title="Delete workflow"><Trash2 size={16} /></button> : null}
              </div>
            </div>
            <WorkflowCanvas agents={agents} workflowId={activeWorkflowId} graph={graphDraft} onGraphChange={graph => setGraphDraft(graph as GraphDraft)} />
          </section>
        ) : null}

        {activeView === "agents" ? (
          <section className="agents-view">
            <div className="registry-toolbar">
              <div><div className="section-kicker">TENANT-BOUND CONFIGURATIONS</div><h2>AGENT REGISTRY</h2></div>
              {isTenantAdmin ? <button className="construct-button construct-button--solid" onClick={() => setIsAgentFormOpen(true)}><Plus size={16} /> REGISTER AGENT</button> : null}
            </div>
            {isAgentFormOpen ? (
              <section className="agent-form panel">
                <div className="panel-heading"><span><Bot size={16} /> REGISTER TENANT AGENT</span><button onClick={() => setIsAgentFormOpen(false)}><X size={16} /></button></div>
                <div className="agent-form__grid">
                  <label>NAME<input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder="e.g. SIGNAL SCOUT" /></label>
                  <label>DESCRIPTION<input value={agentDescription} onChange={event => setAgentDescription(event.target.value)} placeholder="OPERATING PURPOSE" /></label>
                  <label className="agent-form__prompt">SYSTEM SPECIFICATION<textarea value={agentPrompt} onChange={event => setAgentPrompt(event.target.value)} /></label>
                  <button className="construct-button construct-button--solid" onClick={registerAgent} disabled={createAgent.isPending}>{createAgent.isPending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} SAVE AGENT</button>
                </div>
              </section>
            ) : null}
            <div className="agent-table">
              <div className="agent-table__head"><span>NAME / SPECIFICATION</span><span>ROUTING POLICY</span><span>STATUS</span><span>CONTROL</span></div>
              {agents.map(agent => (
                <div className="agent-table__row" key={agent.id}>
                  <div><strong>{agent.name}</strong><small>{agent.description || "NO DESCRIPTION PROVIDED"}</small></div>
                  <div><span className="mono">{agent.modelPreference.toUpperCase()}</span><small>AUTOMATIC COST + LATENCY</small></div>
                  <button className={agent.status === "enabled" ? "status-toggle" : "status-toggle status-toggle--off"} onClick={() => updateAgent.mutate({ tenantId, agentId: agent.id, status: agent.status === "enabled" ? "disabled" : "enabled" })} disabled={!isTenantAdmin}>{agent.status === "enabled" ? <CircleDot size={15} /> : <X size={15} />}{agent.status.toUpperCase()}</button>
                  <button className="icon-button danger" onClick={() => { if (window.confirm("Delete this agent? Agents with retained executions must be disabled instead.")) deleteAgent.mutate({ tenantId, agentId: agent.id }); }} disabled={!isTenantAdmin} title="Delete agent"><Trash2 size={16} /></button>
                </div>
              ))}
              {!agents.length ? <div className="empty-grid-note agent-empty">The registry is clear. Register a tenant-specific agent to begin building a swarm.</div> : null}
            </div>
          </section>
        ) : null}

        {activeView === "traces" ? (
          <section className="traces-view">
            <div className="registry-toolbar"><div><div className="section-kicker">TIMESTAMPED / TENANT-ISOLATED</div><h2>EXECUTION TRACE ARCHIVE</h2></div><span className="trace-count">{snapshot?.traces.length || 0} EVENTS</span></div>
            <div className="trace-timeline">
              {snapshot?.traces.map(trace => (
                <article className={`timeline-event timeline-event--${trace.level}`} key={trace.id}>
                  <div className="timeline-event__time"><span>{formatTime(trace.createdAt)}</span><i /></div>
                  <div className="timeline-event__body"><span>{trace.eventType.toUpperCase()}</span><h3>{trace.message}</h3><small>EXECUTION / {trace.executionId}</small></div>
                </article>
              ))}
              {!snapshot?.traces.length ? <div className="empty-grid-note">No archived events for this tenant. Executions will produce timestamped routing and inference events here.</div> : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
