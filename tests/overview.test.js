import { describe, expect, it } from "vitest";
import { daysUntil, recentActivity, summarize } from "../src/lib/overview.js";

const now = new Date("2026-11-28T12:00:00Z").getTime();

describe("panoramica del master", () => {
  it("conta account, coppie attive e inviti validi o scaduti", () => {
    const s = summarize({
      now,
      profiles: [{ role: "athlete" }, { role: "athlete" }, { role: "professional" }],
      links: [{ status: "active" }, { status: "ended" }],
      invites: [
        { accepted_at: null, expires_at: "2026-12-02T12:00:00Z" },
        { accepted_at: null, expires_at: "2026-11-20T12:00:00Z" },
        { accepted_at: "2026-11-27T10:00:00Z", expires_at: "2026-12-01T12:00:00Z" },
      ],
    });
    expect(s).toEqual({ athletes: 2, professionals: 1, activeLinks: 1, pendingInvites: 1, expiredInvites: 1 });
  });

  it("calcola i giorni alla scadenza", () => {
    expect(daysUntil("2026-12-02T12:00:00Z", now)).toBe(4);
    expect(daysUntil("2026-11-27T12:00:00Z", now)).toBe(-1);
  });

  it("ordina l'attività dalla più recente e ignora sedute non finite", () => {
    const items = recentActivity({
      names: { a1: "Luca" },
      workouts: [
        { athlete_id: "a1", status: "done", finished_at: "2026-11-27T18:00:00Z", session_name: "Giorno A" },
        { athlete_id: "a1", status: "in_progress", finished_at: null },
      ],
      weeklies: [{ athlete_id: "a1", status: "confirmed", confirmed_at: "2026-11-28T08:00:00Z" }],
      profiles: [{ full_name: "Giulia", created_at: "2026-11-26T09:00:00Z" }],
      messages: [{ created_at: "2026-11-25T09:00:00Z" }, { created_at: "2026-11-26T10:00:00Z" }],
    });
    expect(items.map(i => i.kind)).toEqual(["checkin", "workout", "message", "account"]);
    expect(items[1].text).toBe("Luca ha completato Giorno A");
    expect(items[2].text).toBe("2 messaggi negli ultimi 7 giorni");
  });
});
