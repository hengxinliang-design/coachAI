import Foundation
import CoreLocation
import WeatherKit

// MARK: - 环境快照（对应后端 /report/environment-context）

struct EnvironmentSnapshot: Codable {
    var pressure_hpa: Double?
    var pressure_hpa_prev: Double?   // 昨日气压，用于环比降幅
    var altitude_m: Double?
    var temp_c: Double?
    var humidity_pct: Double?
    var location_changed: Bool
    var timezone_shift_hours: Int
}

// MARK: - 环境采集（定位 + WeatherKit + 旅行检测）

final class EnvironmentManager: NSObject, CLLocationManagerDelegate {
    static let shared = EnvironmentManager()

    private let locationManager = CLLocationManager()
    private let weather = WeatherService.shared
    private var locationContinuation: CheckedContinuation<CLLocation, Error>?

    // 旅行检测：上次位置/时区/气压持久化
    private let kLastLat = "env.lastLat"
    private let kLastLon = "env.lastLon"
    private let kLastTZ = "env.lastTZOffset"
    private let kLastPressure = "env.lastPressure"
    private let travelThresholdMeters: CLLocationDistance = 100_000  // 跨城 ≈100km

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestAuthorization() {
        locationManager.requestWhenInUseAuthorization()
    }

    // MARK: - 主入口

    func snapshot() async throws -> EnvironmentSnapshot {
        let location = try await currentLocation()

        // WeatherKit 当前天气
        var tempC: Double?
        var humidityPct: Double?
        var pressureHpa: Double?
        if let current = try? await weather.weather(for: location).currentWeather {
            tempC = current.temperature.converted(to: .celsius).value
            humidityPct = current.humidity * 100
            pressureHpa = current.pressure.converted(to: .hectopascals).value
        }

        // 旅行 / 跨时区检测
        let (changed, tzShift) = detectTravel(location)

        // 气压环比（取上次记录的气压做昨日对照）
        let defaults = UserDefaults.standard
        let prevPressure = defaults.object(forKey: kLastPressure) as? Double
        if let p = pressureHpa { defaults.set(p, forKey: kLastPressure) }

        return EnvironmentSnapshot(
            pressure_hpa: pressureHpa,
            pressure_hpa_prev: prevPressure,
            altitude_m: location.altitude,
            temp_c: tempC,
            humidity_pct: humidityPct,
            location_changed: changed,
            timezone_shift_hours: tzShift
        )
    }

    // MARK: - 旅行检测

    private func detectTravel(_ location: CLLocation) -> (changed: Bool, tzShiftHours: Int) {
        let defaults = UserDefaults.standard
        let currentTZ = TimeZone.current.secondsFromGMT()

        var changed = false
        var tzShift = 0

        if defaults.object(forKey: kLastLat) != nil {
            let last = CLLocation(latitude: defaults.double(forKey: kLastLat),
                                  longitude: defaults.double(forKey: kLastLon))
            if location.distance(from: last) > travelThresholdMeters { changed = true }
            let lastTZ = defaults.integer(forKey: kLastTZ)
            tzShift = (currentTZ - lastTZ) / 3600
            if tzShift != 0 { changed = true }
        }

        defaults.set(location.coordinate.latitude, forKey: kLastLat)
        defaults.set(location.coordinate.longitude, forKey: kLastLon)
        defaults.set(currentTZ, forKey: kLastTZ)
        return (changed, tzShift)
    }

    // MARK: - 一次性定位（包装成 async）

    private func currentLocation() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            locationContinuation = continuation
            locationManager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        locationContinuation?.resume(returning: loc)
        locationContinuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        locationContinuation?.resume(throwing: error)
        locationContinuation = nil
    }
}
