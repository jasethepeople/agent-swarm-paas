import { trpc } from "@/lib/trpc";
import { AlertTriangle, Filter, History } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const time = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

export default function IncidentHistoryPanel({ tenantId }: { tenantId: string }) {
  const [filter, setFilter] = useState<"all" | "open" | "acknowledged">("all");
  const utils = trpc.useUtils();
  const overviewQuery = trpc.orchestration.observability.alerts.useQuery({ tenantId }, { enabled: Boolean(tenantId), refetchInterval: 5_000 });
  const acknowledge = trpc.orchestration.observability.acknowledgeIncident.useMutation({
    onSuccess: () => { utils.orchestration.observability.alerts.invalidate({ tenantId }); toast.success("Incident acknowledged for this tenant."); },
    onError: error => toast.error(error.message),
  });
  const incidents = useMemo(() => overviewQuery.data?.incidents.filter(incident => filter === "all" || incident.status === filter) ?? [], [filter, overviewQuery.data?.incidents]);
  if (!tenantId || !overviewQuery.data?.incidents.length) return null;
  return <section className="incident-history">
    <div className="incident-history__label"><span><History size={14} /> INCIDENT HISTORY</span><label><Filter size={13} /><select value={filter} onChange={event => setFilter(event.target.value as "all" | "open" | "acknowledged")}><option value="all">ALL</option><option value="open">OPEN</option><option value="acknowledged">ACKNOWLEDGED</option></select></label></div>
    {incidents.slice(0, 8).map(incident => <div className={incident.status === "open" ? "incident-row incident-row--open" : "incident-row"} key={incident.id}><div><span><AlertTriangle size={12} /> {incident.alertType.toUpperCase()}</span><p>{incident.message}</p></div><time>{time(incident.createdAt)}</time>{incident.status === "open" ? <button className="construct-button" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ tenantId, incidentId: incident.id })}>ACKNOWLEDGE</button> : <strong>ACKNOWLEDGED</strong>}</div>)}
    {!incidents.length ? <div className="empty-grid-note">No incident records match the active history filter.</div> : null}
  </section>;
}
