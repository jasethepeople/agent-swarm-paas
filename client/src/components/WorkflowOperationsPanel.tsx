import { trpc } from "@/lib/trpc";
import { Copy, Eye, History, Loader2, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import RunAnnotationPanel from "./RunAnnotationPanel";

type Props = {
  tenantId: string;
  activeWorkflowId?: string;
  isTenantAdmin: boolean;
  onWorkflowDuplicated: (workflow: { id: string; name: string; graph: unknown }) => void;
};

const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const time = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "—";

export default function WorkflowOperationsPanel({ tenantId, activeWorkflowId, isTenantAdmin, onWorkflowDuplicated }: Props) {
  const utils = trpc.useUtils();
  const [selectedRunId, setSelectedRunId] = useState("");
  const gatewayInput = { tenantId };
  const runsQuery = trpc.orchestration.workflows.runs.useQuery(gatewayInput, { enabled: Boolean(tenantId), refetchInterval: 5_000 });
  const detailQuery = trpc.orchestration.workflows.detail.useQuery({ tenantId, workflowRunId: selectedRunId }, { enabled: Boolean(tenantId && selectedRunId) });
  const duplicateWorkflow = trpc.orchestration.workflows.duplicate.useMutation({
    onSuccess: async workflow => {
      onWorkflowDuplicated(workflow);
      await utils.orchestration.workflows.list.invalidate(gatewayInput);
      toast.success("Workflow duplicated inside the active tenant.");
    },
    onError: error => toast.error(error.message),
  });
  const replayWorkflow = trpc.orchestration.workflows.replay.useMutation({
    onSuccess: async result => {
      await utils.orchestration.workflows.runs.invalidate(gatewayInput);
      toast.success(`Replay completed with ${numberFormat.format(result.totalTokens)} tokens.`);
    },
    onError: error => toast.error(error.message),
  });

  if (!tenantId) return null;
  return (
    <section className="workflow-operations">
      <div className="workflow-operations__head">
        <div><span>OPERATIONS LAYER</span><h3>RUN CONTROL + LINEAGE</h3></div>
        {isTenantAdmin ? <button className="construct-button" disabled={!activeWorkflowId || duplicateWorkflow.isPending} onClick={() => activeWorkflowId && duplicateWorkflow.mutate({ tenantId, workflowId: activeWorkflowId })}>{duplicateWorkflow.isPending ? <Loader2 className="spin" size={14} /> : <Copy size={14} />} DUPLICATE ACTIVE GRAPH</button> : null}
      </div>
      <section className="workflow-history panel">
        <div className="panel-heading"><span><History size={16} /> RUN REPLAY ARCHIVE</span><span className="panel-index">TENANT-ISOLATED LINEAGE</span></div>
        {runsQuery.data?.length ? <div className="workflow-history__rows">{runsQuery.data.slice(0, 10).map(run => <div className="workflow-history__row" key={run.id}>
          <div><strong>{run.status.toUpperCase()}</strong><span>{time(run.startedAt)} / {numberFormat.format(run.totalTokens)} TOKENS</span></div>
          <p>{run.replayOfRunId ? `REPLAY OF ${run.replayOfRunId}` : "ORIGINAL RUN"}</p>
          <div className="workflow-history__actions"><button className="construct-button" onClick={() => setSelectedRunId(run.id)}><Eye size={14} /> INSPECT</button><button className="construct-button" disabled={replayWorkflow.isPending} onClick={() => replayWorkflow.mutate({ tenantId, sourceWorkflowRunId: run.id })}><RotateCcw size={14} /> REPLAY</button></div>
        </div>)}</div> : <div className="empty-grid-note">Save and run a connected graph to create replayable tenant history.</div>}
      </section>
      {selectedRunId ? <section className="run-detail panel">
        <div className="panel-heading"><span><Eye size={16} /> RUN DETAIL / {selectedRunId}</span><button onClick={() => setSelectedRunId("")}>CLOSE <X size={13} /></button></div>
        {detailQuery.isLoading ? <div className="empty-grid-note">Loading tenant-isolated node executions and handoff traces.</div> : detailQuery.data ? <><div className="run-detail__nodes">{detailQuery.data.nodeExecutions.map(execution => <div className="run-detail__node" key={execution.id}><span>{execution.selectedModel || "ROUTING"}</span><strong>{execution.status.toUpperCase()}</strong><small>{numberFormat.format(execution.totalTokens)} TOKENS / {currencyFormat.format(execution.estimatedCostMicros / 1_000_000)}</small><p>{execution.output || execution.error || "No output retained."}</p></div>)}</div><div className="run-detail__handoffs">{detailQuery.data.handoffs.map(trace => <div key={trace.id}><time>{time(trace.createdAt)}</time><span>{trace.eventType}</span><p>{trace.message}</p></div>)}</div><RunAnnotationPanel tenantId={tenantId} workflowRunId={detailQuery.data.run.id} status={detailQuery.data.run.status} /></> : <div className="empty-grid-note">Run detail is unavailable in the active tenant.</div>}
      </section> : null}
    </section>
  );
}
