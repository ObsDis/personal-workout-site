//
//  Barbell_Mind_Widget_Macros.swift
//  Today's macros for BarbellMind. Reads App Group UserDefaults written by
//  MacroWidgetBridge in the host app. Defaults to zeros when nothing is stored.
//

import WidgetKit
import SwiftUI
import UIKit

// MARK: - Data

private let appGroupID = "group.com.obsidiandist.workout"
private let storageKey = "today_macros"

struct MacrosSnapshot {
    var kcal: Int = 0
    var kcalTarget: Int = 0
    var protein: Int = 0
    var proteinTarget: Int = 0
    var carbs: Int = 0
    var carbsTarget: Int = 0
    var fat: Int = 0
    var fatTarget: Int = 0
    var updatedAt: String = ""

    static var zero: MacrosSnapshot { MacrosSnapshot() }

    static func load() -> MacrosSnapshot {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return .zero }

        func intVal(_ key: String) -> Int {
            if let n = dict[key] as? Int { return n }
            if let n = dict[key] as? Double { return Int(n.rounded()) }
            if let s = dict[key] as? String, let n = Int(s) { return n }
            return 0
        }

        return MacrosSnapshot(
            kcal: intVal("kcal"),
            kcalTarget: intVal("kcal_target"),
            protein: intVal("protein"),
            proteinTarget: intVal("protein_target"),
            carbs: intVal("carbs"),
            carbsTarget: intVal("carbs_target"),
            fat: intVal("fat"),
            fatTarget: intVal("fat_target"),
            updatedAt: dict["updated_at"] as? String ?? ""
        )
    }
}

// MARK: - Timeline

struct MacrosEntry: TimelineEntry {
    let date: Date
    let snapshot: MacrosSnapshot
}

struct MacrosProvider: TimelineProvider {
    func placeholder(in context: Context) -> MacrosEntry {
        MacrosEntry(date: Date(), snapshot: .zero)
    }
    func getSnapshot(in context: Context, completion: @escaping (MacrosEntry) -> Void) {
        completion(MacrosEntry(date: Date(), snapshot: MacrosSnapshot.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MacrosEntry>) -> Void) {
        let now = Date()
        let entry = MacrosEntry(date: now, snapshot: MacrosSnapshot.load())
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Colors

private let kcalColor    = Color(red: 0.96, green: 0.62, blue: 0.13) // orange
private let proteinColor = Color(red: 0.94, green: 0.27, blue: 0.42) // pink/red
private let carbsColor   = Color(red: 0.31, green: 0.78, blue: 0.97) // sky blue
private let fatColor     = Color(red: 0.68, green: 0.46, blue: 0.95) // purple
private let trackColor   = Color.white.opacity(0.08)
private let labelColor   = Color.white.opacity(0.55)
private let subColor     = Color.white.opacity(0.38)

// Brighter "surplus" variant of a macro color (blend toward white).
extension Color {
    func surplus(_ amount: Double = 0.42) -> Color {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let f = CGFloat(amount)
        return Color(red: Double(r + (1 - r) * f),
                     green: Double(g + (1 - g) * f),
                     blue: Double(b + (1 - b) * f))
    }
}

// MARK: - Kcal open arc + big number

struct KcalDial: View {
    var consumed: Int
    var target: Int

    private var ratio: Double {
        guard target > 0 else { return 0 }
        return Double(consumed) / Double(target)
    }
    private var progress: Double { min(1.0, max(0, ratio)) }
    private var overProgress: Double { min(1.0, max(0, ratio - 1)) }
    private var isOver: Bool { target > 0 && consumed > target }
    private var displayText: String {
        if target <= 0 { return "\(consumed)" }
        return isOver ? "+\(consumed - target)" : "\(max(0, target - consumed))"
    }
    private var labelText: String {
        target <= 0 ? "kcal" : (isOver ? "kcal over" : "kcal left")
    }

    var body: some View {
        ZStack {
            // Track: 3/4 open arc
            Circle()
                .trim(from: 0.125, to: 0.875)
                .rotation(.degrees(90))
                .stroke(kcalColor.opacity(0.22),
                        style: StrokeStyle(lineWidth: 10, lineCap: .round))
            // Progress (capped at one full lap)
            Circle()
                .trim(from: 0.125, to: 0.125 + 0.75 * progress)
                .rotation(.degrees(90))
                .stroke(kcalColor,
                        style: StrokeStyle(lineWidth: 10, lineCap: .round))
            // Surplus second lap
            if overProgress > 0 {
                Circle()
                    .trim(from: 0.125, to: 0.125 + 0.75 * overProgress)
                    .rotation(.degrees(90))
                    .stroke(kcalColor.surplus(),
                            style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .shadow(color: kcalColor.opacity(0.85), radius: 4)
            }
            VStack(spacing: 1) {
                Text(displayText)
                    .font(.system(size: 32, weight: .bold, design: .default))
                    .foregroundColor(isOver ? kcalColor.surplus(0.6) : .white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text(labelText)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(labelColor)
                if isOver {
                    Text("\(consumed) kcal")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(subColor)
                }
            }
        }
    }
}

// MARK: - Single macro row (small ring + label/value + bar)

struct MacroRow: View {
    var label: String
    var value: Int
    var target: Int
    var color: Color

    private var ratio: Double {
        guard target > 0 else { return 0 }
        return Double(value) / Double(target)
    }
    private var pct: Double { min(1.0, max(0, ratio)) }
    private var overPct: Double { min(1.0, max(0, ratio - 1)) }
    private var isOver: Bool { target > 0 && value > target }

    var body: some View {
        HStack(spacing: 10) {
            // Small ring with dot
            ZStack {
                Circle()
                    .stroke(trackColor, style: StrokeStyle(lineWidth: 3))
                Circle()
                    .trim(from: 0, to: pct)
                    .rotation(.degrees(-90))
                    .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                if overPct > 0 {
                    Circle()
                        .trim(from: 0, to: overPct)
                        .rotation(.degrees(-90))
                        .stroke(color.surplus(), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .shadow(color: color.opacity(0.85), radius: 3)
                }
                Circle()
                    .fill(isOver ? color.surplus(0.55) : color)
                    .frame(width: 7, height: 7)
            }
            .frame(width: 26, height: 26)

            // Label + value + bar
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Spacer(minLength: 6)
                    if isOver {
                        Text("+\(value - target)g over")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(color.surplus(0.55))
                    } else {
                        Text("\(value)")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                        Text(" / \(target)g")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(subColor)
                    }
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(trackColor)
                        Capsule().fill(color).frame(width: geo.size.width * pct)
                        if overPct > 0 {
                            Capsule().fill(color.surplus())
                                .frame(width: geo.size.width * overPct)
                                .shadow(color: color.opacity(0.85), radius: 3)
                        }
                    }
                }
                .frame(height: 4)
            }
        }
    }
}

// MARK: - Body

struct MacrosWidgetView: View {
    var entry: MacrosEntry

    var body: some View {
        HStack(spacing: 14) {
            KcalDial(consumed: entry.snapshot.kcal, target: entry.snapshot.kcalTarget)
                .frame(width: 122, height: 122)

            VStack(spacing: 12) {
                MacroRow(label: "Protein",
                         value: entry.snapshot.protein,
                         target: entry.snapshot.proteinTarget,
                         color: proteinColor)
                MacroRow(label: "Carbs",
                         value: entry.snapshot.carbs,
                         target: entry.snapshot.carbsTarget,
                         color: carbsColor)
                MacroRow(label: "Fat",
                         value: entry.snapshot.fat,
                         target: entry.snapshot.fatTarget,
                         color: fatColor)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 6)
        .widgetURL(URL(string: "barbellmind://nutrition"))
    }
}

// MARK: - Widget

struct Barbell_Mind_Widget_Macros: Widget {
    let kind: String = "Barbell_Mind_Widget_Macros"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MacrosProvider()) { entry in
            if #available(iOS 17.0, *) {
                MacrosWidgetView(entry: entry)
                    .containerBackground(for: .widget) {
                        Color(red: 0.07, green: 0.07, blue: 0.08)
                    }
            } else {
                MacrosWidgetView(entry: entry)
                    .padding()
                    .background(Color(red: 0.07, green: 0.07, blue: 0.08))
            }
        }
        .configurationDisplayName("Today's macros")
        .description("Calories left + protein, carbs, fat.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    Barbell_Mind_Widget_Macros()
} timeline: {
    MacrosEntry(date: .now, snapshot: .zero)
    MacrosEntry(date: .now, snapshot: MacrosSnapshot(
        kcal: 322, kcalTarget: 2400,
        protein: 47, proteinTarget: 300,
        carbs: 61, carbsTarget: 200,
        fat: 7, fatTarget: 120
    ))
    MacrosEntry(date: .now, snapshot: MacrosSnapshot(
        kcal: 2760, kcalTarget: 2400,
        protein: 340, proteinTarget: 300,
        carbs: 180, carbsTarget: 200,
        fat: 150, fatTarget: 120
    ))
}
