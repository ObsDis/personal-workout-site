//
//  MacroWidgetBridge.swift
//  Capacitor plugin: writes today's macros AND today's workout summary to App
//  Group UserDefaults so the home-screen widgets can read them.
//  Also reads the user's real Apple Activity ring goals (Move / Exercise / Stand)
//  and de-duplicated daily totals (steps / flights / distance) from HealthKit.
//

import Foundation
import Capacitor
import WidgetKit
import HealthKit

@objc(MacroWidgetBridge)
public class MacroWidgetBridge: CAPPlugin {

    static let appGroup = "group.com.obsidiandist.workout"
    static let macrosKey = "today_macros"
    static let workoutKey = "today_workout"
    let healthStore = HKHealthStore()

    @objc func setMacros(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("missing json"); return }
        UserDefaults(suiteName: Self.appGroup)?.set(json, forKey: Self.macrosKey)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve(["ok": true])
    }

    @objc func setTodayWorkout(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("missing json"); return }
        UserDefaults(suiteName: Self.appGroup)?.set(json, forKey: Self.workoutKey)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve(["ok": true])
    }

    // Returns Apple's real Activity goals + today's values, plus de-duplicated
    // today totals for steps / flights / distance. Summing raw HealthKit samples
    // double-counts iPhone + Watch overlap; HKStatisticsQuery(.cumulativeSum)
    // merges sources exactly like the Health app does.
    @objc func getActivityGoals(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["available": false])
            return
        }
        let store = self.healthStore
        let summaryType = HKObjectType.activitySummaryType()
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        let flightType = HKQuantityType.quantityType(forIdentifier: .flightsClimbed)!
        let distType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!

        func cumulativeToday(_ type: HKQuantityType, unit: HKUnit, _ done: @escaping (Double?) -> Void) {
            let startOfDay = Calendar.current.startOfDay(for: Date())
            let pred = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred, options: .cumulativeSum) { (_, stats, _) in
                done(stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }

        func runAll() {
            var counts: [String: Any] = [:]
            let group = DispatchGroup()
            group.enter(); cumulativeToday(stepType, unit: HKUnit.count()) { v in if let v = v { counts["stepsToday"] = v }; group.leave() }
            group.enter(); cumulativeToday(flightType, unit: HKUnit.count()) { v in if let v = v { counts["flightsToday"] = v }; group.leave() }
            group.enter(); cumulativeToday(distType, unit: HKUnit.meter()) { v in if let v = v { counts["distanceMetersToday"] = v }; group.leave() }
            group.notify(queue: .main) {
                let cal = Calendar.current
                var comps = cal.dateComponents([.year, .month, .day], from: Date())
                comps.calendar = cal
                let predicate = HKQuery.predicate(forActivitySummariesBetweenStart: comps, end: comps)
                let sq = HKActivitySummaryQuery(predicate: predicate) { (_, summaries, _) in
                    var result: [String: Any] = ["available": true]
                    for (k, v) in counts { result[k] = v }
                    if let s = summaries?.last {
                        result["moveValue"] = s.activeEnergyBurned.doubleValue(for: HKUnit.kilocalorie())
                        result["moveGoal"] = s.activeEnergyBurnedGoal.doubleValue(for: HKUnit.kilocalorie())
                        result["exerciseValue"] = s.appleExerciseTime.doubleValue(for: HKUnit.minute())
                        result["exerciseGoal"] = s.appleExerciseTimeGoal.doubleValue(for: HKUnit.minute())
                        result["standValue"] = s.appleStandHours.doubleValue(for: HKUnit.count())
                        result["standGoal"] = s.appleStandHoursGoal.doubleValue(for: HKUnit.count())
                    }
                    call.resolve(result)
                }
                store.execute(sq)
            }
        }

        // Ask for read access once (mirrors the JS one-time gate). Step / flight /
        // distance are already granted via the main sync, so no new sheet appears.
        let asked = UserDefaults.standard.bool(forKey: "activity_auth_asked")
        if asked {
            runAll()
        } else {
            let readTypes: Set<HKObjectType> = [summaryType, stepType, flightType, distType]
            store.requestAuthorization(toShare: [], read: readTypes) { (_, _) in
                UserDefaults.standard.set(true, forKey: "activity_auth_asked")
                runAll()
            }
        }
    }
}
