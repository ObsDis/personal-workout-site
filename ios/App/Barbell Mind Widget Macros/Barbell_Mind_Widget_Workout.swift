//
//  Barbell_Mind_Widget_Workout.swift
//  Today's workout card for BarbellMind. Reads App Group UserDefaults written
//  by MacroWidgetBridge.setTodayWorkout. Tapping the card deep-links into the
//  active workout screen via barbellmind://log.
//

import WidgetKit
import SwiftUI

// MARK: - Data

private let appGroupID = "group.com.obsidiandist.workout"
private let storageKey = "today_workout"

struct WorkoutSnapshot {
    var slotType: String = "rest"   // pull / push / legs / upper / lower / abs / core / cardio / stretching / rest / custom
    var title: String = ""           // friendly display name (e.g. "Pull")
    var exerciseCount: Int = 0
    var estMinutes: Int = 0
    var updatedAt: String = ""

    static var empty: WorkoutSnapshot { WorkoutSnapshot() }

    static func load() -> WorkoutSnapshot {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return .empty }

        func intVal(_ key: String) -> Int {
            if let n = dict[key] as? Int { return n }
            if let n = dict[key] as? Double { return Int(n.rounded()) }
            if let s = dict[key] as? String, let n = Int(s) { return n }
            return 0
        }

        return WorkoutSnapshot(
            slotType: (dict["slot_type"] as? String ?? "rest").lowercased(),
            title: dict["title"] as? String ?? "",
            exerciseCount: intVal("exercise_count"),
            estMinutes: intVal("est_minutes"),
            updatedAt: dict["updated_at"] as? String ?? ""
        )
    }
}

// MARK: - Colors per split (matches the app's CSS slot colors)

private func splitColor(_ slot: String) -> Color {
    switch slot {
    case "pull":      return Color(red: 0.40, green: 0.78, blue: 1.00)
    case "push":      return Color(red: 1.00, green: 0.46, blue: 0.42)
    case "upper":     return Color(red: 1.00, green: 0.46, blue: 0.42)
    case "legs":      return Color(red: 0.96, green: 0.62, blue: 0.13)
    case "lower":     return Color(red: 0.96, green: 0.62, blue: 0.13)
    case "core":      return Color(red: 0.68, green: 0.46, blue: 0.95)
    case "abs":       return Color(red: 0.68, green: 0.46, blue: 0.95)
    case "cardio":    return Color(red: 0.20, green: 0.83, blue: 0.60)
    case "stretch", "stretching":
                      return Color(red: 0.95, green: 0.78, blue: 0.34)
    case "rest":      return Color.white.opacity(0.5)
    default:          return Color(red: 0.20, green: 0.83, blue: 0.60) // accent green
    }
}

private func splitLabel(_ slot: String) -> String {
    switch slot {
    case "pull": return "PULL DAY"
    case "push": return "PUSH DAY"
    case "upper": return "UPPER DAY"
    case "legs": return "LEG DAY"
    case "lower": return "LOWER DAY"
    case "core", "abs": return "CORE DAY"
    case "cardio": return "CARDIO DAY"
    case "stretch", "stretching": return "STRETCH DAY"
    case "rest": return "REST DAY"
    default: return slot.uppercased() + " DAY"
    }
}

// MARK: - Timeline

struct WorkoutEntry: TimelineEntry {
    let date: Date
    let snapshot: WorkoutSnapshot
}

struct WorkoutProvider: TimelineProvider {
    func placeholder(in context: Context) -> WorkoutEntry {
        WorkoutEntry(date: Date(), snapshot: .empty)
    }
    func getSnapshot(in context: Context, completion: @escaping (WorkoutEntry) -> Void) {
        completion(WorkoutEntry(date: Date(), snapshot: WorkoutSnapshot.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WorkoutEntry>) -> Void) {
        let now = Date()
        let entry = WorkoutEntry(date: now, snapshot: WorkoutSnapshot.load())
        // Refresh every 30min — workouts don't change often once the plan is set.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now.addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - View

struct WorkoutWidgetView: View {
    var entry: WorkoutEntry

    private var hasPlan: Bool { entry.snapshot.exerciseCount > 0 || !entry.snapshot.title.isEmpty }
    private var color: Color { splitColor(entry.snapshot.slotType) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Split chip
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(splitLabel(entry.snapshot.slotType))
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(0.8)
                    .foregroundColor(color)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 999)
                    .stroke(color.opacity(0.4), lineWidth: 1)
                    .background(RoundedRectangle(cornerRadius: 999).fill(color.opacity(0.10)))
            )

            // Big title
            Text(displayTitle)
                .font(.system(size: 30, weight: .bold, design: .default))
                .foregroundColor(.white)
                .padding(.top, 14)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            // Meta row
            if hasPlan {
                HStack(spacing: 14) {
                    Label {
                        Text("\(entry.snapshot.exerciseCount) exercises")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white.opacity(0.55))
                    } icon: {
                        Image(systemName: "dumbbell.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white.opacity(0.55))
                    }
                    Label {
                        Text("~\(entry.snapshot.estMinutes) min")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white.opacity(0.55))
                    } icon: {
                        Image(systemName: "clock")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white.opacity(0.55))
                    }
                }
                .padding(.top, 4)
            } else {
                Text("No workout set for today")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.45))
                    .padding(.top, 4)
            }

            Spacer(minLength: 8)

            // Start button — tapping the widget deep-links via widgetURL below.
            HStack(spacing: 8) {
                Image(systemName: "play.fill")
                    .font(.system(size: 12, weight: .bold))
                Text(hasPlan ? "Start workout" : "Plan a workout")
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundColor(color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(color.opacity(0.35), lineWidth: 1)
                    .background(RoundedRectangle(cornerRadius: 14).fill(color.opacity(0.08)))
            )
        }
        .widgetURL(URL(string: hasPlan ? "barbellmind://log" : "barbellmind://plan"))
    }

    private var displayTitle: String {
        if !entry.snapshot.title.isEmpty { return entry.snapshot.title }
        // Fallback from slot
        switch entry.snapshot.slotType {
        case "pull": return "Pull"
        case "push": return "Push"
        case "upper": return "Upper"
        case "legs", "lower": return "Legs"
        case "core", "abs": return "Core"
        case "cardio": return "Cardio"
        case "stretch", "stretching": return "Stretch"
        case "rest": return "Rest day"
        default: return "Today"
        }
    }
}

// MARK: - Widget

struct Barbell_Mind_Widget_Workout: Widget {
    let kind: String = "Barbell_Mind_Widget_Workout"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WorkoutProvider()) { entry in
            if #available(iOS 17.0, *) {
                WorkoutWidgetView(entry: entry)
                    .containerBackground(for: .widget) {
                        Color(red: 0.07, green: 0.07, blue: 0.08)
                    }
            } else {
                WorkoutWidgetView(entry: entry)
                    .padding()
                    .background(Color(red: 0.07, green: 0.07, blue: 0.08))
            }
        }
        .configurationDisplayName("Today's workout")
        .description("Start today's workout from the home screen.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    Barbell_Mind_Widget_Workout()
} timeline: {
    WorkoutEntry(date: .now, snapshot: WorkoutSnapshot(
        slotType: "pull", title: "Pull", exerciseCount: 6, estMinutes: 48
    ))
}
