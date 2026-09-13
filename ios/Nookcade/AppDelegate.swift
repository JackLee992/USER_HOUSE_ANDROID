import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    let host = GameHost()
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = NativeShell(host: host)
        window.makeKeyAndVisible(); self.window = window
        host.start()
        return true
    }
    func applicationWillResignActive(_ application: UIApplication) { host.pauseAndSave() }
    func applicationDidEnterBackground(_ application: UIApplication) { host.pauseAndSave() }
    func applicationWillTerminate(_ application: UIApplication) { host.pauseAndSave() }
    func applicationDidBecomeActive(_ application: UIApplication) { host.refresh() }
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown
    }
}
