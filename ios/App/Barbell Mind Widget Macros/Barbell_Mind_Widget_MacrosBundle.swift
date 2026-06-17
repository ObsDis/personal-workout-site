//
//  Barbell_Mind_Widget_MacrosBundle.swift
//  Bundles all home-screen widgets for BarbellMind.
//

import WidgetKit
import SwiftUI

@main
struct Barbell_Mind_Widget_MacrosBundle: WidgetBundle {
    var body: some Widget {
        Barbell_Mind_Widget_Macros()
        Barbell_Mind_Widget_Workout()
    }
}
