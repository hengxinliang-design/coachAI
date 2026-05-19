import Foundation
import HealthKit

// MARK: - 数据模型

struct HealthSnapshot: Codable {
    var hrv_today: Double
    var rhr_today: Double
    var sleep_hours: Double
    var sleep_awake_count: Int
    var deep_sleep_pct: Double
    var rem_sleep_pct: Double
    var hrv_week: [HRVDay]
    var workout_today: WorkoutRecord
    var sync_time: String
    var sync_date: String

    struct HRVDay: Codable {
        var day: String   // "M/D" 格式
        var val: Double
    }

    struct WorkoutRecord: Codable {
        var type: String
        var duration_min: Int
        var calories: Int
    }
}

// MARK: - HealthKit 管理器

class HealthKitManager {
    static let shared = HealthKitManager()
    private let store = HKHealthStore()

    // 需要读取的数据类型
    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        let identifiers: [HKQuantityTypeIdentifier] = [
            .heartRateVariabilitySDNN,
            .restingHeartRate,
            .activeEnergyBurned,
        ]
        for id in identifiers {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        if let workout = HKObjectType.workoutType() as? HKObjectType { types.insert(workout) }
        return types
    }()

    // MARK: - 权限申请

    func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, NSError(domain: "HealthKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "此设备不支持 HealthKit"]))
            return
        }
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            DispatchQueue.main.async { completion(success, error) }
        }
    }

    // MARK: - 主入口：获取完整快照

    func fetchSnapshot(completion: @escaping (Result<HealthSnapshot, Error>) -> Void) {
        let group = DispatchGroup()
        let today = Calendar.current.startOfDay(for: Date())
        let now = Date()

        var hrv: Double = 0
        var rhr: Double = 0
        var sleepHours: Double = 0
        var awakeCount: Int = 0
        var deepPct: Double = 0
        var remPct: Double = 0
        var hrvWeek: [HealthSnapshot.HRVDay] = []
        var workout = HealthSnapshot.WorkoutRecord(type: "未记录", duration_min: 0, calories: 0)

        // ── HRV 今日 ──
        group.enter()
        fetchDailyStat(
            type: HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            unit: HKUnit.secondUnit(with: .milli),
            start: today, end: now
        ) { val in
            hrv = val ?? 0
            group.leave()
        }

        // ── 静息心率今日 ──
        group.enter()
        fetchDailyStat(
            type: HKQuantityType.quantityType(forIdentifier: .restingHeartRate)!,
            unit: HKUnit(from: "count/min"),
            start: today, end: now
        ) { val in
            rhr = val ?? 0
            group.leave()
        }

        // ── 睡眠分析（昨晚 20:00 → 今日 14:00）──
        group.enter()
        let sleepStart = Calendar.current.date(byAdding: .hour, value: -16, to: today)!
        fetchSleep(start: sleepStart, end: now) { hours, awake, deep, rem in
            sleepHours = hours
            awakeCount = awake
            deepPct = deep
            remPct = rem
            group.leave()
        }

        // ── HRV 本周 7 天 ──
        group.enter()
        fetchWeeklyHRV { days in
            hrvWeek = days
            group.leave()
        }

        // ── 今日训练 ──
        group.enter()
        fetchTodayWorkout(start: today, end: now) { rec in
            if let rec = rec { workout = rec }
            group.leave()
        }

        // ── 汇总 ──
        group.notify(queue: .main) {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            let timeStr = formatter.string(from: Date())

            let cal = Calendar.current
            let month = cal.component(.month, from: Date())
            let day = cal.component(.day, from: Date())
            let dateStr = "\(month)月\(day)日"

            let snapshot = HealthSnapshot(
                hrv_today: hrv,
                rhr_today: rhr,
                sleep_hours: sleepHours,
                sleep_awake_count: awakeCount,
                deep_sleep_pct: deepPct,
                rem_sleep_pct: remPct,
                hrv_week: hrvWeek,
                workout_today: workout,
                sync_time: timeStr,
                sync_date: dateStr
            )
            completion(.success(snapshot))
        }
    }

    // MARK: - 工具方法

    private func fetchDailyStat(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date, end: Date,
        completion: @escaping (Double?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(
            withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .discreteAverage
        ) { _, stats, _ in
            let val = stats?.averageQuantity()?.doubleValue(for: unit)
            DispatchQueue.main.async { completion(val) }
        }
        store.execute(query)
    }

    private func fetchSleep(
        start: Date, end: Date,
        completion: @escaping (_ hours: Double, _ awake: Int, _ deepPct: Double, _ remPct: Double) -> Void
    ) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(0, 0, 0, 0); return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        ) { _, samples, _ in
            guard let samples = samples as? [HKCategorySample] else {
                DispatchQueue.main.async { completion(0, 0, 0, 0) }
                return
            }

            var totalSec = 0.0, deepSec = 0.0, remSec = 0.0
            var awakeCount = 0

            for s in samples {
                let dur = s.endDate.timeIntervalSince(s.startDate)
                switch HKCategoryValueSleepAnalysis(rawValue: s.value) {
                case .asleepDeep:
                    totalSec += dur; deepSec += dur
                case .asleepREM:
                    totalSec += dur; remSec += dur
                case .asleepCore, .asleepUnspecified:
                    totalSec += dur
                case .awake:
                    if dur > 120 { awakeCount += 1 } // 超过2分钟才算觉醒
                default: break
                }
            }

            let hours = totalSec / 3600
            let deepPct = totalSec > 0 ? (deepSec / totalSec) * 100 : 0
            let remPct  = totalSec > 0 ? (remSec  / totalSec) * 100 : 0
            DispatchQueue.main.async { completion(hours, awakeCount, deepPct, remPct) }
        }
        store.execute(query)
    }

    private func fetchWeeklyHRV(completion: @escaping ([HealthSnapshot.HRVDay]) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else {
            completion([]); return
        }
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let weekAgo = cal.date(byAdding: .day, value: -6, to: today)!

        let predicate = HKQuery.predicateForSamples(withStart: weekAgo, end: Date())
        let interval = DateComponents(day: 1)
        let anchorDate = today

        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .discreteAverage,
            anchorDate: anchorDate,
            intervalComponents: interval
        )
        query.initialResultsHandler = { _, results, _ in
            var days: [HealthSnapshot.HRVDay] = []
            results?.enumerateStatistics(from: weekAgo, to: Date()) { stats, _ in
                let val = stats.averageQuantity()?.doubleValue(for: .init(from: "ms")) ?? 0
                let m = cal.component(.month, from: stats.startDate)
                let d = cal.component(.day, from: stats.startDate)
                days.append(.init(day: "\(m)/\(d)", val: val))
            }
            DispatchQueue.main.async { completion(days) }
        }
        store.execute(query)
    }

    private func fetchTodayWorkout(
        start: Date, end: Date,
        completion: @escaping (HealthSnapshot.WorkoutRecord?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
        ) { _, samples, _ in
            guard let workouts = samples as? [HKWorkout], let w = workouts.first else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let durationMin = Int(w.duration / 60)
            let calories = Int(w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0)
            let typeName = w.workoutActivityType.chineseName
            DispatchQueue.main.async {
                completion(.init(type: typeName, duration_min: durationMin, calories: calories))
            }
        }
        store.execute(query)
    }
}

// MARK: - 训练类型中文名

extension HKWorkoutActivityType {
    var chineseName: String {
        switch self {
        case .running:          return "跑步"
        case .walking:          return "步行"
        case .cycling:          return "骑行"
        case .swimming:         return "游泳"
        case .yoga:             return "瑜伽"
        case .functionalStrengthTraining, .traditionalStrengthTraining:
                                return "力量训练"
        case .highIntensityIntervalTraining: return "HIIT"
        case .elliptical:       return "椭圆机"
        case .rowing:           return "划船机"
        default:                return "综合训练"
        }
    }
}
