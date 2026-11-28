import { describe, expect, it } from "vitest";
import { attentionFor } from "../src/lib/attention.js";

describe("motivo dell'attenzione", () => {
  it("i messaggi da leggere vengono prima di tutto, con il testo se è uno solo", () => {
    expect(attentionFor({ unread: 1, lastMessage: "Domanda sul Romanian deadlift", toAnswer: 2 }))
      .toMatchObject({ count: 3, reason: "«Domanda sul Romanian deadlift»", urgent: true });
    expect(attentionFor({ unread: 3 }).reason).toBe("3 messaggi da leggere");
  });
  it("poi le note su pasti e serie, il settimanale appena inviato e i check-in mancanti", () => {
    expect(attentionFor({ toAnswer: 1, firstNote: "Ero fuori a pranzo" }).reason).toBe("Nota: «Ero fuori a pranzo»");
    expect(attentionFor({ weeklyDaysAgo: 1, lastCheckinDaysAgo: 0 }).reason).toBe("Check-in settimanale da guardare");
    expect(attentionFor({ lastCheckinDaysAgo: 5 })).toMatchObject({ reason: "Nessun check-in da 5 giorni", count: 0, urgent: true });
    expect(attentionFor({ lastCheckinDaysAgo: 5, hasCheckin: false, tasks: 2 }).reason).toBe("2 promemoria aperti");
    expect(attentionFor({ lastCheckinDaysAgo: 0 })).toMatchObject({ reason: "", urgent: false });
  });
});
