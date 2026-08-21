import { trpc } from "@/lib/trpc";
import { ClipboardList } from "lucide-react";

const time = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

export default function AuditLedger({ tenantId, isTenantAdmin }: { tenantId: string; isTenantAdmin: boolean }) {
  const audit = trpc.orchestration.governance.audit.useQuery({ tenantId }, { enabled: Boolean(tenantId && isTenantAdmin), refetchInterval: 10_000 });
  if (!isTenantAdmin || !tenantId) return null;
  return <section className="audit-ledger panel">
    <div className="panel-heading"><span><ClipboardList size={16} /> TENANT GOVERNANCE LEDGER</span><span className="panel-index">ADMIN-ONLY / AUDIT TRAIL</span></div>
    {audit.data?.length ? <div className="audit-ledger__rows">{audit.data.slice(0, 10).map(event => <div className="audit-ledger__row" key={event.id}><time>{time(event.createdAt)}</time><span>{event.action.toUpperCase()}</span><p>{event.summary}</p></div>)}</div> : <div className="empty-grid-note">Governance actions, workflow changes, collaborator controls, and incident acknowledgements will be retained here.</div>}
  </section>;
}
