import Foundation
import AuthenticationServices

/// Pure, UI-free parts of the Safari → app login handoff, kept separate so
/// they can be unit-tested with a plain `swiftc` run (see apple/tests).
enum AppHandoffLogic {
    static let handlerName = "appHandoff"
    static let startBase = "https://schedule-kw.com/app-handoff/start"
    static let callbackScheme = "schedulekw"
    static let allowedHost = "schedule-kw.com"
    static let challengeLength = 43

    enum Outcome: Equatable {
        case code(String)
        case error(String)
    }

    /// Message body must be `{ challenge: <43 chars of A-Za-z0-9_-> }`; anything else is ignored.
    static func validChallenge(from body: Any) -> String? {
        guard let dict = body as? [String: Any], let value = dict["challenge"] as? String else { return nil }
        return isValidChallenge(value) ? value : nil
    }

    static func isValidChallenge(_ value: String) -> Bool {
        let scalars = Array(value.unicodeScalars)
        guard scalars.count == challengeLength else { return false }
        return scalars.allSatisfy { s in
            (s.value >= 0x41 && s.value <= 0x5A) || (s.value >= 0x61 && s.value <= 0x7A)
                || (s.value >= 0x30 && s.value <= 0x39) || s == "_" || s == "-"
        }
    }

    static func startURL(challenge: String) -> URL? {
        guard isValidChallenge(challenge), var c = URLComponents(string: startBase) else { return nil }
        c.queryItems = [URLQueryItem(name: "challenge", value: challenge)]
        return c.url
    }

    /// error=… wins over code=… if both are present; no usable parameter is a failure.
    static func outcome(callbackURL: URL?, error: Error?) -> Outcome {
        if let error {
            if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                return .error("cancelled")
            }
            return .error("failed")
        }
        guard let url = callbackURL,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else {
            return .error("failed")
        }
        if let err = items.first(where: { $0.name == "error" })?.value, !err.isEmpty { return .error(err) }
        if let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty { return .code(code) }
        return .error("failed")
    }

    /// JS for the page. Values are JSON-encoded, never concatenated raw.
    static func script(for outcome: Outcome) -> String {
        let detail: [String: String]
        switch outcome {
        case .code(let c): detail = ["code": c]
        case .error(let e): detail = ["error": e]
        }
        let data = (try? JSONSerialization.data(withJSONObject: detail, options: [.sortedKeys])) ?? Data("{\"error\":\"failed\"}".utf8)
        var json = String(decoding: data, as: UTF8.self)
        json = json.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "window.dispatchEvent(new CustomEvent('app-handoff',{detail:\(json)}))"
    }
}
