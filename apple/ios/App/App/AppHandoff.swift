import UIKit
import WebKit
import AuthenticationServices

/// Receives `webkit.messageHandlers.appHandoff.postMessage({challenge})` from the page,
/// runs the Safari-cookie-sharing ASWebAuthenticationSession and reports the result back
/// to the page as an `app-handoff` CustomEvent. The page itself exchanges the code.
/// Holds the web view weakly and is never referenced by it except through
/// WKUserContentController, so there is no retain cycle with the view controller.
final class AppHandoffHandler: NSObject, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    private weak var webView: WKWebView?
    private var session: ASWebAuthenticationSession?

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == AppHandoffLogic.handlerName,
              message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == AppHandoffLogic.allowedHost,
              let challenge = AppHandoffLogic.validChallenge(from: message.body),
              let url = AppHandoffLogic.startURL(challenge: challenge) else { return }
        DispatchQueue.main.async { [weak self] in self?.start(url) }
    }

    private func start(_ url: URL) {
        guard session == nil else { return } // one session at a time
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: AppHandoffLogic.callbackScheme) { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.session = nil
                self.report(AppHandoffLogic.outcome(callbackURL: callbackURL, error: error))
            }
        }
        session.prefersEphemeralWebBrowserSession = false // share Safari's cookies
        session.presentationContextProvider = self
        self.session = session
        if !session.start() {
            self.session = nil
            report(.error("failed"))
        }
    }

    private func report(_ outcome: AppHandoffLogic.Outcome) {
        webView?.evaluateJavaScript(AppHandoffLogic.script(for: outcome), completionHandler: nil)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return webView?.window ?? ASPresentationAnchor()
    }

    func cancel() {
        session?.cancel()
        session = nil
    }
}
