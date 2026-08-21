import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import IncidentHistoryPanel from "@/components/IncidentHistoryPanel";
import WorkflowOperationsPanel from "@/components/WorkflowOperationsPanel";
import { trpc } from "@/lib/trpc";
import "@/styles/replay.css";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Braces,
  ChevronDown,
  CircleDot,
  Command,
  Cpu,
  Database,
  Gauge,
  History,
  Layers3,
  Loader2,
  LogOut,
  Network,
  Plus,
  Play,
  Radio,
  RotateCcw,
  Save,
  Send,
  Terminal,
  Trash2,
  UserRound,
  UserPlus,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type WorkspaceView = "overview" | "workflow" | "agents" | "traces" | "collaboration";
type GraphDraft = { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };

const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

const navItems: Array<{ id: WorkspaceView; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "CONTROL ROOM", icon: Gauge },
  { id: "workflow", label: "SWARM GRAPH", icon: Network },
  { id: "agents", label: "AGENT REGISTRY", icon: Bot },
  { id: "collaboration", label: "COLLABORATORS", icon: UsersRound },
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
  const [workflowInput, setWorkflowInput] = useState("Analyze the current orchestration objective and return the next operational action.");
  const [latestOutput, setLatestOutput] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [costThreshold, setCostThreshold] = useState("0.0750");
  const [latencyThreshold, setLatencyThreshold] = useState("8000");
  const [failureThreshold, setFailureThreshold] = useState("1");

  const tenantsQuery = trpc.orchestration.workspace.listTenants.useQuery(undefined, { enabled: !!user });
  const activeTenant = useMemo(() => tenantsQuery.data?.find(tenant => tenant.id === tenantId), [tenantId, tenantsQuery.data]);
  const gatewayInput = { tenantId };
  const queryEnabled = Boolean(user && tenantId);
  const agentsQuery = trpc.orchestration.agents.list.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 10_000 });
  const workflowsQuery = trpc.orchestration.workflows.list.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 10_000 });
  const workflowRunsQuery = trpc.orchestration.workflows.runs.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 5_000 });
  const observabilityQuery = trpc.orchestration.observability.snapshot.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 5_000 });
  const alertsQuery = trpc.orchestration.observability.alerts.useQuery(gatewayInput, { enabled: queryEnabled, refetchInterval: 5_000 });
  const collaboratorsQuery = trpc.orchestration.collaboration.list.useQuery(gatewayInput, { enabled: queryEnabled && activeTenant?.membershipRole === "admin", refetchInterval: 10_000 });

  useEffect(() => {
    if (!tenantId && tenantsQuery.data?.[0]) setTenantId(tenantsQuery.data[0].id);
  }, [tenantId, tenantsQuery.data]);

  useEffect(() => {
    if (!runAgentId && agentsQuery.data?.[0]) setRunAgentId(agentsQuery.data[0].id);
  }, [agentsQuery.data, runAgentId]);

  useEffect(() => {
    if (!alertsQuery.data?.settings) return;
    setCostThreshold((alertsQuery.data.settings.maxExecutionCostMicros / 1_000_000).toFixed(4));
    setLatencyThreshold(String(alertsQuery.data.settings.maxLatencyMs));
    setFailureThreshold(String(alertsQuery.data.settings.maxFailures));
  }, [alertsQuery.data?.settings]);

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

  const runWorkflow = trpc.orchestration.workflows.run.useMutation({
    onSuccess: async result => {
      setLatestOutput(result.output);
      await Promise.all([
        utils.orchestration.observability.snapshot.invalidate(gatewayInput),
        utils.orchestration.observability.alerts.invalidate(gatewayInput),
        utils.orchestration.workflows.runs.invalidate(gatewayInput),
      ]);
      toast.success(`Sequential workflow run completed with ${numberFormat.format(result.totalTokens)} tokens.`);
    },
    onError: error => toast.error(error.message),
  });

  const replayWorkflow = trpc.orchestration.workflows.replay.useMutation({
    onSuccess: async result => {
      setLatestOutput(result.output);
      await Promise.all([
        utils.orchestration.workflows.runs.invalidate(gatewayInput),
        utils.orchestration.observability.snapshot.invalidate(gatewayInput),
        utils.orchestration.observability.alerts.invalidate(gatewayInput),
      ]);
      toast.success(`Workflow replay completed with ${numberFormat.format(result.totalTokens)} tokens.`);
    },
    onError: error => toast.error(error.message),
  });

  const inviteCollaborator = trpc.orchestration.collaboration.invite.useMutation({
    onSuccess: async invitation => {
      setInviteEmail("");
      await utils.orchestration.collaboration.list.invalidate(gatewayInput);
      toast.success(invitation.deliveryStatus === "sent" ? `Invitation email sent to ${invitation.email}.` : `Invitation staged for ${invitation.email}. It activates when that user signs in.`);
    },
    onError: error => toast.error(error.message),
  });

  const redeliverInvitation = trpc.orchestration.collaboration.redeliverInvitation.useMutation({
    onSuccess: async invitation => {
      await utils.orchestration.collaboration.list.invalidate(gatewayInput);
      toast.success(invitation.deliveryStatus === "sent" ? `Invitation email sent to ${invitation.email}.` : invitation.deliveryError || "Invitation delivery remains pending sender configuration.");
    },
    onError: error => toast.error(error.message),
  });

  const changeCollaboratorRole = trpc.orchestration.collaboration.changeRole.useMutation({
    onSuccess: () => utils.orchestration.collaboration.list.invalidate(gatewayInput),
    onError: error => toast.error(error.message),
  });

  const removeCollaborator = trpc.orchestration.collaboration.remove.useMutation({
    onSuccess: () => {
      utils.orchestration.collaboration.list.invalidate(gatewayInput);
      toast.success("Collaborator removed from this tenant.");
    },
    onError: error => toast.error(error.message),
  });

  const updateAlerts = trpc.orchestration.observability.updateAlerts.useMutation({
    onSuccess: () => {
      utils.orchestration.observability.alerts.invalidate(gatewayInput);
      toast.success("Tenant alert thresholds updated.");
    },
    onError: error => toast.error(error.message),
  });

  const acknowledgeIncident = trpc.orchestration.observability.acknowledgeIncident.useMutation({
    onSuccess: () => {
      utils.orchestration.observability.alerts.invalidate(gatewayInput);
      toast.success("Incident acknowledged for this tenant.");
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
  const alertOverview = alertsQuery.data;

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
            <h1>{activeView === "overview" ? "COMMAND ROOM" : activeView === "workflow" ? "SWARM GRAPH" : activeView === "agents" ? "AGENT REGISTRY" : activeView === "collaboration" ? "COLLABORATORS" : "TRACE ARCHIVE"}</h1>
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

            <section className={alertOverview?.alerts.length ? "alert-deck alert-deck--active" : "alert-deck"}>
              <div className="alert-deck__header"><span><AlertTriangle size={17} /> OPERATIONAL ALERT MATRIX</span><strong>{alertOverview?.alerts.length || 0} ACTIVE</strong></div>
              <div className="alert-deck__signals">
                {alertOverview?.alerts.length ? alertOverview.alerts.map((alert, index) => <div className="alert-signal" key={`${alert.type}-${alert.executionId}-${index}`}><span>{alert.type.toUpperCase()}</span><p>{alert.message}</p><strong>{alert.type === "cost" ? currencyFormat.format(alert.value / 1_000_000) : alert.type === "latency" ? `${alert.value} MS` : `${alert.value} FAILURES`}</strong></div>) : <div className="alert-deck__clear">THRESHOLDS ARMED. NO COST, LATENCY, OR FAILURE BREACHES DETECTED.</div>}
              </div>
              {alertOverview?.incidents.length ? <div className="incident-history">
                <div className="incident-history__label"><History size={14} /> INCIDENT HISTORY</div>
                {alertOverview.incidents.slice(0, 5).map(incident => <div className={incident.status === "open" ? "incident-row incident-row--open" : "incident-row"} key={incident.id}>
                  <div><span>{incident.alertType.toUpperCase()}</span><p>{incident.message}</p></div>
                  <time>{formatTime(incident.createdAt)}</time>
                  {incident.status === "open" ? <button className="construct-button" onClick={() => acknowledgeIncident.mutate({ tenantId, incidentId: incident.id })} disabled={acknowledgeIncident.isPending}>ACKNOWLEDGE</button> : <strong>ACKNOWLEDGED</strong>}
                </div>)}
              </div> : null}
              {isTenantAdmin && alertOverview?.settings ? <div className="alert-deck__controls">
                <label>MAX COST / USD<input value={costThreshold} inputMode="decimal" onChange={event => setCostThreshold(event.target.value)} /></label>
                <label>MAX LATENCY / MS<input value={latencyThreshold} inputMode="numeric" onChange={event => setLatencyThreshold(event.target.value)} /></label>
                <label>MAX FAILURES<input value={failureThreshold} inputMode="numeric" onChange={event => setFailureThreshold(event.target.value)} /></label>
                <button className="construct-button" onClick={() => updateAlerts.mutate({ tenantId, enabled: alertOverview.settings.enabled, maxExecutionCostMicros: Math.max(1, Math.round(Number(costThreshold) * 1_000_000)), maxLatencyMs: Math.max(100, Number(latencyThreshold)), maxFailures: Math.max(1, Number(failureThreshold)) })} disabled={updateAlerts.isPending}>ARM THRESHOLDS</button>
              </div> : null}
            </section>
            <IncidentHistoryPanel tenantId={tenantId} />

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
                <button className="construct-button construct-button--solid" onClick={() => activeWorkflowId && runWorkflow.mutate({ tenantId, workflowId: activeWorkflowId, initialInput: workflowInput })} disabled={!activeWorkflowId || runWorkflow.isPending}>
                  {runWorkflow.isPending ? <Loader2 className="spin" size={15} /> : <Play size={15} />} {runWorkflow.isPending ? "RUNNING GRAPH" : "RUN GRAPH"}
                </button>
                {activeWorkflowId ? <button className="icon-button danger" onClick={() => deleteWorkflow.mutate({ tenantId, workflowId: activeWorkflowId })} title="Delete workflow"><Trash2 size={16} /></button> : null}
              </div>
            </div>
            <div className="workflow-run-input"><span>SEQUENTIAL RUN INPUT</span><textarea value={workflowInput} onChange={event => setWorkflowInput(event.target.value)} placeholder="Input passed to starting nodes; every output becomes downstream context." /></div>
            <WorkflowCanvas agents={agents} workflowId={activeWorkflowId} graph={graphDraft} onGraphChange={graph => setGraphDraft(graph as GraphDraft)} />
            <WorkflowOperationsPanel tenantId={tenantId} activeWorkflowId={activeWorkflowId} isTenantAdmin={isTenantAdmin} onWorkflowDuplicated={workflow => { setActiveWorkflowId(workflow.id); setWorkflowName(workflow.name); setGraphDraft((workflow.graph as GraphDraft) || emptyGraph); }} />
            <section className="workflow-history panel">
              <div className="panel-heading"><span><History size={16} /> RUN REPLAY ARCHIVE</span><span className="panel-index">TENANT-ISOLATED LINEAGE</span></div>
              {workflowRunsQuery.data?.length ? <div className="workflow-history__rows">{workflowRunsQuery.data.slice(-10).reverse().map(run => <div className="workflow-history__row" key={run.id}>
                <div><strong>{run.status.toUpperCase()}</strong><span>{formatTime(run.startedAt)} / {numberFormat.format(run.totalTokens)} TOKENS</span></div>
                <p>{run.replayOfRunId ? `REPLAY OF ${run.replayOfRunId}` : "ORIGINAL RUN"}</p>
                <button className="construct-button" onClick={() => replayWorkflow.mutate({ tenantId, sourceWorkflowRunId: run.id })} disabled={replayWorkflow.isPending}><RotateCcw size={14} /> REPLAY</button>
              </div>)}</div> : <div className="empty-grid-note">Save and run a connected graph to create replayable tenant history.</div>}
            </section>
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

        {activeView === "collaboration" ? (
          <section className="collaboration-view">
            <div className="registry-toolbar"><div><div className="section-kicker">ACCESS CONTROL / ACTIVE TENANT</div><h2>COLLABORATOR MATRIX</h2></div><span className="trace-count">{collaboratorsQuery.data?.members.length || 0} MEMBERS</span></div>
            {isTenantAdmin ? <section className="collaboration-invite panel">
              <div className="panel-heading"><span><UserPlus size={16} /> INVITE COLLABORATOR</span><span className="panel-index">ACTIVATES ON SIGN-IN / EMAIL AWAITS VERIFIED SENDER</span></div>
              <div className="collaboration-invite__form"><input type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="COLLABORATOR@DOMAIN.COM" /><select value={inviteRole} onChange={event => setInviteRole(event.target.value as "admin" | "user")}><option value="user">USER / EXECUTE + VIEW</option><option value="admin">ADMIN / MANAGE + CONFIGURE</option></select><button className="construct-button construct-button--solid" onClick={() => inviteCollaborator.mutate({ tenantId, email: inviteEmail, role: inviteRole })} disabled={!inviteEmail || inviteCollaborator.isPending}><UserPlus size={15} /> ISSUE INVITE</button></div>
            </section> : <div className="empty-grid-note">Your current tenant role is read-only for collaboration administration.</div>}
            <div className="collaborator-table">
              <div className="collaborator-table__head"><span>OPERATOR</span><span>ACCESS ROLE</span><span>MEMBERSHIP</span><span>CONTROL</span></div>
              {collaboratorsQuery.data?.members.map(member => <div className="collaborator-table__row" key={member.userId}><div><strong>{member.name || "UNNAMED OPERATOR"}</strong><small>{member.email || "NO EMAIL AVAILABLE"}</small></div><select value={member.role} onChange={event => changeCollaboratorRole.mutate({ tenantId, userId: member.userId, role: event.target.value as "admin" | "user" })} disabled={!isTenantAdmin || member.userId === user.id}><option value="admin">ADMIN</option><option value="user">USER</option></select><span className="collaborator-status">ACTIVE / {formatTime(member.createdAt)}</span><button className="icon-button danger" title="Remove collaborator" onClick={() => { if (window.confirm("Remove this collaborator from the current tenant?")) removeCollaborator.mutate({ tenantId, userId: member.userId }); }} disabled={!isTenantAdmin || member.userId === user.id}><Trash2 size={16} /></button></div>)}
              {collaboratorsQuery.data?.invitations.filter(invitation => invitation.status === "pending").map(invitation => <div className="collaborator-table__row collaborator-table__row--pending" key={invitation.id}><div><strong>{invitation.email}</strong><small>INVITED BY TENANT ADMINISTRATOR</small></div><span className="mono">{invitation.role.toUpperCase()}</span><span className="collaborator-status">PENDING / {formatTime(invitation.createdAt)}</span><div className="pending-delivery"><span className="pending-mark">{invitation.deliveryStatus === "sent" ? "EMAIL SENT" : invitation.deliveryStatus === "failed" ? "DELIVERY FAILED" : "AWAITING VERIFIED SENDER"}</span>{isTenantAdmin && invitation.deliveryStatus !== "sent" ? <button className="construct-button" onClick={() => redeliverInvitation.mutate({ tenantId, invitationId: invitation.id })} disabled={redeliverInvitation.isPending}>RETRY</button> : null}</div></div>)}
              {!collaboratorsQuery.data?.members.length ? <div className="empty-grid-note">No collaborator records are available for this tenant.</div> : null}
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
