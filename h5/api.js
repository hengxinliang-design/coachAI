// api.js — coach.ai 后端客户端（附加式 + 离线兜底）
//
// 后端可达时增强（history-aware 评分、持久化、趋势、教练口吻渲染）；
// 不可达时所有函数返回 null，调用方回落到本地计算，保证离线可用。
//
// 后端地址：localStorage["coachai.backendURL"] 覆盖，默认走开发机本地。
// WKWebView 真机联调时设成 Mac 的局域网 IP，如 http://192.168.1.20:8000。

const DEFAULT_BASE = "http://127.0.0.1:8000";

export function apiBase() {
  try {
    return localStorage.getItem("coachai.backendURL") || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

async function request(method, path, body, ms = 4000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const init = { method, signal: ctrl.signal, headers: {} };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const r = await fetch(apiBase() + path, init);
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null; // 超时/网络失败/后端不可达 → 让调用方走本地兜底
  }
}

// 存入当日读数 → 后端用 DB 历史算 history-aware 恢复评分。返回 recovery 或 null。
export async function saveHealthMetric(d) {
  const res = await request("POST", "/data/health-metric", {
    date: today(),
    hrv_ms: d.hrv > 0 ? d.hrv : null,
    rhr_bpm: Math.round(d.rhr || 0),
    wrist_temp_dev: typeof d.wrist_temp_dev === "number" ? d.wrist_temp_dev : 0,
  });
  return res?.recovery ?? null;
}

// CBum 训练计划
export async function getPlan(grade, split = "auto", equipment = "full") {
  return request("POST", "/workout/plan", { grade, split, equipment });
}

// 教练口吻渲染：返回模板文本（零成本），或 null
export async function renderText(kind, data) {
  const res = await request("POST", "/render", { kind, data, include_claude_request: false });
  return res?.template_text ?? null;
}

// 历史趋势
export async function getHistory(frm, to) {
  return request("GET", `/data/health-metrics?frm=${frm}&to=${to}`);
}

// 观察指标 CRUD
export async function listAnnotations() {
  return request("GET", "/data/annotations");
}
export async function addAnnotation(label, category, date = today()) {
  return request("POST", "/data/annotation", { date, label, category });
}
export async function deleteAnnotation(id) {
  return request("DELETE", `/data/annotation/${id}`);
}
