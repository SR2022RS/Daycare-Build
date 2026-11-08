import { describe, expect, it } from "vitest";

import { alertCopy } from "./health-alert";

const NAME = "The Daycare Owner Intensive";
const fail = (name: string) => ({ name, ok: false, detail: "x" });

describe("alertCopy", () => {
  it("does not claim buyers are blocked when only the database failed", () => {
    // The Sep 12 / Sep 14 alerts: one timed-out database request.
    const copy = alertCopy(NAME, [fail("database.registrations")]);
    expect(copy.headline).not.toMatch(/cannot buy/i);
    expect(copy.lead).toMatch(/buying still works/i);
    expect(copy.lead).toMatch(/registrations list/);
    expect(copy.subject).toMatch(/aren't being recorded/);
  });

  it("names the email consequence when only Resend failed", () => {
    const copy = alertCopy(NAME, [fail("resend.domain")]);
    expect(copy.lead).toMatch(/emails can't send/);
    expect(copy.lead).not.toMatch(/registrations list/);
  });

  it("lists both consequences when database and Resend both failed", () => {
    const copy = alertCopy(NAME, [
      fail("database.registrations"),
      fail("resend.domain"),
    ]);
    expect(copy.lead).toMatch(/registrations list, and confirmation/);
  });

  it("says buyers are blocked when the payment page is down", () => {
    const copy = alertCopy(NAME, [fail("payment.page")]);
    expect(copy.headline).toBe("Customers cannot buy right now");
    expect(copy.subject).toBe(`ALERT: ${NAME} checkout is broken`);
  });

  it("lets a buyer-blocking failure win over a recording-only one", () => {
    const copy = alertCopy(NAME, [
      fail("database.registrations"),
      fail("ghl.configured"),
    ]);
    expect(copy.headline).toBe("Customers cannot buy right now");
  });
});
