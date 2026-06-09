import Foundation

// MARK: - 同步服务：采集 HealthKit + 环境 → 上报后端

/// 串联本地采集与后端上报。一次 syncNow() 完成：
///   1. HealthKit 快照 → POST /data/health-metric（后端用 DB 历史算 history-aware 恢复评分）
///   2. 今日训练       → POST /data/workout
///   3. 环境 + 血氧    → POST /report/environment-context（方向 B：解释性标注）
enum SyncService {

    static func syncNow() {
        Task { await runSync() }
    }

    static func runSync() async {
        let snapshot: HealthSnapshot
        do {
            snapshot = try await fetchHealthSnapshot()
        } catch {
            print("[Sync] HealthKit 采集失败: \(error.localizedDescription)")
            return
        }

        let today = isoDate(Date())

        // 1) 健康指标（HRV / RHR / 腕温偏差）
        do {
            try await APIClient.post("/data/health-metric", [
                "date": today,
                "hrv_ms": snapshot.hrv_today > 0 ? snapshot.hrv_today : nil,
                "rhr_bpm": Int(snapshot.rhr_today.rounded()),
                "wrist_temp_dev": snapshot.wrist_temp_dev,
            ])
        } catch { print("[Sync] health-metric: \(error.localizedDescription)") }

        // 2) 今日训练（有记录才上报）
        if snapshot.workout_today.duration_min > 0 {
            do {
                try await APIClient.post("/data/workout", [
                    "date": today,
                    "workout_type": snapshot.workout_today.type,
                    "duration_min": snapshot.workout_today.duration_min,
                    "calories_kcal": Double(snapshot.workout_today.calories),
                ])
            } catch { print("[Sync] workout: \(error.localizedDescription)") }
        }

        // 3) 环境上下文（WeatherKit + 定位 + 血氧）
        do {
            let env = try await EnvironmentManager.shared.snapshot()
            try await APIClient.post("/report/environment-context", [
                "pressure_hpa": env.pressure_hpa,
                "pressure_hpa_prev": env.pressure_hpa_prev,
                "altitude_m": env.altitude_m,
                "temp_c": env.temp_c,
                "humidity_pct": env.humidity_pct,
                "spo2_pct": snapshot.spo2_pct > 0 ? snapshot.spo2_pct : nil,
                "location_changed": env.location_changed,
                "timezone_shift_hours": env.timezone_shift_hours,
            ])
        } catch { print("[Sync] environment: \(error.localizedDescription)") }

        print("[Sync] 完成 \(today)")
    }

    // MARK: - 工具

    /// 把 completion-based 的 fetchSnapshot 包装成 async
    private static func fetchHealthSnapshot() async throws -> HealthSnapshot {
        try await withCheckedThrowingContinuation { continuation in
            HealthKitManager.shared.fetchSnapshot { result in
                continuation.resume(with: result)
            }
        }
    }

    private static func isoDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}
