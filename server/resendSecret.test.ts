import { describe, expect, it } from "vitest";

describe("Resend invitation delivery credential", () => {
  it("authenticates to the lightweight domains endpoint", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY must be configured").toBeTruthy();

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status, `Resend credential validation failed with ${response.status}`).toBe(200);
  }, 15_000);
});
