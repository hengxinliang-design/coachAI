import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAnnotation,
  apiBase,
  deleteAnnotation,
  getHistory,
  getPlan,
  renderText,
  saveHealthMetric,
} from "./api.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(status, jsonBody) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
  });
}

describe("apiBase", () => {
  it("falls back to default when localStorage unavailable", () => {
    expect(apiBase()).toBe("http://127.0.0.1:8000");
  });
});

describe("saveHealthMetric", () => {
  it("returns recovery on success", async () => {
    global.fetch = mockFetch(200, { date: "2026-06-09", recovery: { score: 88, grade: "green" } });
    const rec = await saveHealthMetric({ hrv: 66, rhr: 52, wrist_temp_dev: 0 });
    expect(rec).toEqual({ score: 88, grade: "green" });
  });

  it("posts mapped payload (date/hrv_ms/rhr_bpm/wrist_temp_dev)", async () => {
    const f = mockFetch(200, { recovery: { score: 90, grade: "green" } });
    global.fetch = f;
    await saveHealthMetric({ hrv: 66.4, rhr: 52.6, wrist_temp_dev: 0.1 });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.hrv_ms).toBe(66.4);
    expect(body.rhr_bpm).toBe(53);            // rounded
    expect(body.wrist_temp_dev).toBe(0.1);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sends null hrv_ms when no reading", async () => {
    const f = mockFetch(200, { recovery: {} });
    global.fetch = f;
    await saveHealthMetric({ hrv: 0, rhr: 50 });
    expect(JSON.parse(f.mock.calls[0][1].body).hrv_ms).toBeNull();
  });

  it("returns null on server error", async () => {
    global.fetch = mockFetch(500, {});
    expect(await saveHealthMetric({ hrv: 66, rhr: 52 })).toBeNull();
  });

  it("returns null on network failure (offline fallback)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network"));
    expect(await saveHealthMetric({ hrv: 66, rhr: 52 })).toBeNull();
  });
});

describe("getPlan / renderText / history / annotations", () => {
  it("getPlan returns plan json", async () => {
    global.fetch = mockFetch(200, { split: "push", exercises: [] });
    expect((await getPlan("green", "push", "full")).split).toBe("push");
  });

  it("renderText returns template_text", async () => {
    global.fetch = mockFetch(200, { template_text: "🟢 今日恢复优秀。" });
    expect(await renderText("recovery", { grade: "green" })).toBe("🟢 今日恢复优秀。");
  });

  it("renderText returns null on failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("x"));
    expect(await renderText("recovery", {})).toBeNull();
  });

  it("getHistory builds range query", async () => {
    const f = mockFetch(200, []);
    global.fetch = f;
    await getHistory("2026-06-01", "2026-06-08");
    expect(f.mock.calls[0][0]).toContain("/data/health-metrics?frm=2026-06-01&to=2026-06-08");
  });

  it("addAnnotation posts label+category", async () => {
    const f = mockFetch(200, { id: 1 });
    global.fetch = f;
    await addAnnotation("镁甘氨酸", "supplement");
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.label).toBe("镁甘氨酸");
    expect(body.category).toBe("supplement");
  });

  it("deleteAnnotation uses DELETE", async () => {
    const f = mockFetch(200, { deleted: 1 });
    global.fetch = f;
    await deleteAnnotation(1);
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });
});
