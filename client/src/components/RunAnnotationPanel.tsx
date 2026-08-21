import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const time = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "—";

export default function RunAnnotationPanel({ tenantId, workflowRunId, status }: { tenantId: string; workflowRunId: string; status: "running" | "completed" | "failed" }) {
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();
  const annotations = trpc.orchestration.governance.annotations.list.useQuery({ tenantId, workflowRunId }, { enabled: Boolean(tenantId && workflowRunId), refetchInterval: 8_000 });
  const add = trpc.orchestration.governance.annotations.add.useMutation({
    onSuccess: async () => { setBody(""); await utils.orchestration.governance.annotations.list.invalidate({ tenantId, workflowRunId }); toast.success("Run annotation recorded."); },
    onError: error => toast.error(error.message),
  });
  return <section className="run-annotations">
    <div className="run-annotations__label"><MessageSquarePlus size={14} /> OPERATIONAL ANNOTATIONS</div>
    {status === "running" ? <div className="empty-grid-note">Annotations become available when this workflow run completes or fails.</div> : <div className="run-annotations__compose"><textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Record an operational observation, deployment note, or follow-up." /><button className="construct-button" disabled={add.isPending || body.trim().length < 2} onClick={() => add.mutate({ tenantId, workflowRunId, body: body.trim() })}>{add.isPending ? <Loader2 size={14} className="spin" /> : <MessageSquarePlus size={14} />} ADD NOTE</button></div>}
    {annotations.data?.length ? <div className="run-annotations__rows">{annotations.data.map(annotation => <div key={annotation.id}><time>{time(annotation.createdAt)}</time><p>{annotation.body}</p></div>)}</div> : null}
  </section>;
}
