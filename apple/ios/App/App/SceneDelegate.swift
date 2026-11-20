import UIKit
import Capacitor

/// Hands a validated Universal Link to the web view. A link that arrives before the
/// web view exists (cold launch) waits in `pending` until the view controller is ready.
enum AppLinkRouter {
    static var pending: URL?
    static var open: ((URL) -> Void)?

    static func route(_ url: URL) {
        if let open { open(url) } else { pending = url }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        if let url = connectionOptions.userActivities.lazy.compactMap({ AppLinkLogic.destination(for: $0) }).first {
            AppLinkRouter.route(url)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if let url = AppLinkLogic.destination(for: userActivity) { AppLinkRouter.route(url) }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
