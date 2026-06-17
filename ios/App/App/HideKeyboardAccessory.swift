//
//  HideKeyboardAccessory.swift
//  Two native iOS tweaks for Capacitor's WKWebView:
//   1. Removes the keyboard accessory bar (the ‹ › ✓ row above the keyboard).
//   2. Disables the iOS scroll indicators (the grey scrollbar that flashes during scroll).
//
//  Both run from AppDelegate's didFinishLaunching.
//

import UIKit
import WebKit
import ObjectiveC.runtime

enum HideKeyboardAccessory {
    static func install() {
        // Apply once after initial layout, then retry every second for 10 seconds.
        // Capacitor's WebView is occasionally re-created during cold boot; the retries
        // keep our hooks attached.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { applyAll() }
        var tries = 0
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { t in
            tries += 1
            applyAll()
            if tries >= 10 { t.invalidate() }
        }
    }

    private static func applyAll() {
        guard let webView = findWebView() else { return }
        removeInputAccessoryView(from: webView)
        hideScrollIndicators(on: webView)
    }

    private static func findWebView(in root: UIView? = nil) -> WKWebView? {
        let start = root ?? UIApplication.shared.windows.first?.rootViewController?.view
        guard let start = start else { return nil }
        if let wv = start as? WKWebView { return wv }
        for sub in start.subviews {
            if let wv = findWebView(in: sub) { return wv }
        }
        return nil
    }

    // MARK: - Scroll indicators

    private static func hideScrollIndicators(on webView: WKWebView) {
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        // Also: keep bounce so swipe-to-refresh-style behaviors still feel right.
        webView.scrollView.scrollIndicatorInsets = .zero
    }

    // MARK: - Keyboard accessory bar

    private static func removeInputAccessoryView(from webView: WKWebView) {
        var contentView: UIView?
        for sub in webView.scrollView.subviews {
            let typeName = String(describing: type(of: sub))
            if typeName.contains("ContentView") || typeName.contains("WKContent") {
                contentView = sub
                break
            }
        }
        guard let target = contentView else { return }

        let currentClassName = String(cString: class_getName(object_getClass(target)!))
        if currentClassName.hasPrefix("_NoKeybdAccessory_") { return }

        guard let targetClass = object_getClass(target) else { return }
        let newClassName = "_NoKeybdAccessory_" + currentClassName

        if let existing = NSClassFromString(newClassName) {
            object_setClass(target, existing)
            return
        }

        guard let newClass = objc_allocateClassPair(targetClass, newClassName, 0) else { return }

        let noAccessory: @convention(block) (Any) -> UIView? = { _ in return nil }
        let imp = imp_implementationWithBlock(noAccessory)
        let sel = #selector(getter: UIResponder.inputAccessoryView)
        if let originalMethod = class_getInstanceMethod(UIResponder.self, sel) {
            let typeEncoding = method_getTypeEncoding(originalMethod)
            class_addMethod(newClass, sel, imp, typeEncoding)
        }
        objc_registerClassPair(newClass)
        object_setClass(target, newClass)
    }
}
