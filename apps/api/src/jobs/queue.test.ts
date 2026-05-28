import { describe, expect, it } from "vitest";
import { enqueueJob, registerJobHandler } from "./queue.js";

describe("queue", () => {
  it("runs handler inline when BullMQ disabled", async () => {
    let called = 0;
    registerJobHandler("notification.send", async (payload) => {
      called += 1;
      expect(payload.notificationId).toBe("notif_1");
    });

    const result = await enqueueJob("notification.send", { notificationId: "notif_1" });
    expect(result.mode).toBe("inline");
    expect(called).toBe(1);
  });

  it("throws when no handler is registered", async () => {
    await expect(enqueueJob("report.daily", { organizationId: "org_1" })).rejects.toThrow(/No handler/);
  });
});
