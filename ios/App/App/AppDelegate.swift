import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        excludeLogFromICloudBackup()
        return true
    }

    /// Keeps the log off iCloud.
    ///
    /// iOS backs an app's Library directory up to iCloud by default, and the
    /// WebView's storage — every photograph and every entry — lives inside it.
    /// Without this the app would be quietly uploading the user's mirror
    /// selfies to Apple's servers, which is exactly what onboarding promises
    /// does not happen. The promise has to hold at the operating-system level,
    /// not only inside the web layer.
    ///
    /// The accepted cost is that a restored phone starts empty. That is what
    /// the export and import in Settings are for, and a restore the user
    /// performs deliberately is the honest version of this anyway.
    private func excludeLogFromICloudBackup() {
        let fileManager = FileManager.default
        guard let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else {
            return
        }

        // WebKit holds IndexedDB and the local storage the app relies on.
        for name in ["WebKit", "Caches"] {
            var url = library.appendingPathComponent(name)
            guard fileManager.fileExists(atPath: url.path) else { continue }

            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            do {
                try url.setResourceValues(values)
            } catch {
                // Best effort. A failure here must never stop the app starting,
                // and it is visible in Settings, which reports where data lives.
            }
        }
    }

    /// The blur that covers the app switcher's snapshot.
    ///
    /// The iOS counterpart of Android's FLAG_SECURE: when the app resigns
    /// active, iOS photographs the screen for the switcher, and that snapshot
    /// would otherwise be a mirror selfie visible to anyone flicking through
    /// open apps. A full-screen blur laid on just before the snapshot is
    /// taken, and removed the moment the app is active again, keeps the
    /// switcher tile abstract. The passcode lock guards the front door; this
    /// closes the windows.
    private var privacyShield: UIVisualEffectView?

    func applicationWillResignActive(_ application: UIApplication) {
        guard privacyShield == nil, let window = self.window else { return }
        let shield = UIVisualEffectView(effect: UIBlurEffect(style: .regular))
        shield.frame = window.bounds
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(shield)
        privacyShield = shield
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        privacyShield?.removeFromSuperview()
        privacyShield = nil
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
