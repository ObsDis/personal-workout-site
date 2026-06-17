import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        HideKeyboardAccessory.install()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Handle barbellmind:// widget deep links by mapping them to the web router.
        if url.scheme == "barbellmind" {
            // Map host (e.g. "nutrition") to a hash route the web app already understands.
            let host = url.host ?? "/"
            let route: String
            switch host {
                case "nutrition", "eat":   route = "#/nutrition"
                case "today", "":          route = "#/"
                case "plan":               route = "#/plan"
                case "progress":           route = "#/progress"
                case "chat":               route = "#/chat"
                case "profile":            route = "#/profile"
                default:                   route = "#/" + host
            }
            // Inject the route via JS once Capacitor's WebView is ready.
            if let bridge = (app.delegate as? AppDelegate)?.window?.rootViewController as? CAPBridgeViewController {
                bridge.bridge?.webView?.evaluateJavaScript("location.hash = '\(route)';", completionHandler: nil)
            }
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
