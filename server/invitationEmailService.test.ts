import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInvitationEmail } from "./invitationEmailService";

const originalSender = process.env.RESEND_FROM_EMAIL;
const originalApiKey = process.env.RESEND_API_KEY;

afterEach(() => {
  if (originalSender === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalSender;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
});

describe("invitation email delivery", () => {
  it("holds delivery safely when no verified sender has been configured", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendInvitationEmail({ recipient: "invitee@example.com", tenantName: "Alpha", role: "user" });

    expect(result).toMatchObject({ deliveryStatus: "not_sent" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits a transactional invitation through Resend once sender configuration is present", async () => {
    process.env.RESEND_FROM_EMAIL = "Swarmline <invitations@example.com>";
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendInvitationEmail({ recipient: "invitee@example.com", tenantName: "Alpha", role: "admin" });

    expect(result).toEqual({ deliveryStatus: "sent", providerMessageId: "email-1" });
    expect(fetchSpy).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });
});
