/**
 * Coach.AI Native Bridge Adapter
 * 
 * 在 H5 入口文件最顶部引入此文件（或将内容合并进 App.jsx）
 * 
 * 检测运行环境：
 *   - window.CoachBridge.isNative === true → 运行在 iOS 原生壳里
 *   - 否则 → 运行在普通浏览器 / Claude Artifact
 */

(function () {
  // ── 环境检测 ─────────────────────────────────────────────────────────────
  const isNative = typeof window.CoachBridge !== 'undefined'
    && window.CoachBridge.isNative === true;

  /**
   * 统一同步接口
   * 
   * 在原生环境：调用 HealthKit Bridge
   * 在浏览器环境：触发 sendPrompt 让 Claude 读取（现有逻辑）
   * 
   * @param {Function} onData  - 收到数据回调 (snapshot: Object) => void
   * @param {Function} onError - 错误回调 (err: string) => void
   */
  window.CoachSync = {
    isNative,

    sync(onData, onError) {
      if (isNative) {
        // ── 原生模式：通过 Bridge 调用 HealthKit ──
        window.CoachBridge.onDataReceived = onData;

        // 错误回调
        window.__receiveHealthError = function (msg) {
          if (typeof onError === 'function') onError(msg);
        };

        window.CoachBridge.sync();
      } else {
        // ── 浏览器模式：通过 Claude sendPrompt ──
        if (typeof window.sendPrompt === 'function') {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
          const weekAgo = new Date(now - 7 * 86400000);
          const weekStart = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;

          window.sendPrompt(
            `COACH_AI_SYNC:请立即读取我的 Apple Watch 健康数据，` +
            `今日 ${today}，本周 ${weekStart} 到 ${today}。` +
            `只回复纯 JSON：{"hrv_today":数值,"rhr_today":数值,"sleep_hours":数值,` +
            `"sleep_awake_count":数值,"deep_sleep_pct":数值,"rem_sleep_pct":数值,` +
            `"hrv_week":[{"day":"M/D","val":数值}],` +
            `"workout_today":{"type":"类型","duration_min":数值,"calories":数值},` +
            `"sync_time":"HH:MM"}`
          );
        } else {
          if (typeof onError === 'function') {
            onError('当前环境不支持自动同步，请手动输入数据');
          }
        }
      }
    },
  };

  console.log(`[CoachSync] Mode: ${isNative ? 'Native iOS' : 'Browser'}`);
})();
