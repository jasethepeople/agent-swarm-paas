export type InvitationDeliveryAttempt = {
  deliveryStatus: "not_sent" | "sent" | "failed";
  providerMessageId?: string;
  deliveryError?: string;
};

export async function sendInvitationEmail(input: { recipient: string; tenantName: string; role: "admin" | "user" }) {
  const sender = process.env.RESEND_FROM_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!sender) return { deliveryStatus: "not_sent" as const, deliveryError: "A verified sender identity has not been configured." };
  if (!apiKey) return { deliveryStatus: "not_sent" as const, deliveryError: "Email delivery credentials are not configured." };

  const roleName = input.role === "admin" ? "administrator" : "workspace user";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: [input.recipient],
      subject: `You are invited to ${input.tenantName} on Swarmline`,
      text: `You have been invited to join ${input.tenantName} as a ${roleName}. Sign in to Swarmline with this email address to activate your tenant membership.`,
      html: `<p>You have been invited to join <strong>${escapeHtml(input.tenantName)}</strong> as a ${roleName}.</p><p>Sign in to Swarmline with <strong>${escapeHtml(input.recipient)}</strong> to activate your tenant membership.</p>`,
      tags: [{ name: "event", value: "tenant-invitation" }, { name: "role", value: input.role }],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!response.ok) return { deliveryStatus: "failed" as const, deliveryError: payload.message ?? payload.name ?? `Provider request failed with ${response.status}.` };
  return { deliveryStatus: "sent" as const, providerMessageId: payload.id };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
