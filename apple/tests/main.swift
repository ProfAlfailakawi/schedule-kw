// Run: swiftc -o /tmp/handoff-test apple/ios/App/App/AppHandoffLogic.swift apple/tests/main.swift && /tmp/handoff-test
import Foundation
import AuthenticationServices

var failures = 0
func check(_ ok: Bool, _ name: String) { if !ok { failures += 1; print("FAIL:", name) } else { print("ok:", name) } }

let good = String(repeating: "A", count: 21) + String(repeating: "z", count: 10) + "0123456789_-"
check(good.count == 43, "fixture is 43 chars")
check(AppHandoffLogic.validChallenge(from: ["challenge": good]) == good, "valid challenge accepted")
check(AppHandoffLogic.validChallenge(from: ["challenge": good + "\n"]) == nil, "trailing newline rejected")
check(AppHandoffLogic.validChallenge(from: ["challenge": String(good.dropLast())]) == nil, "42 chars rejected")
check(AppHandoffLogic.validChallenge(from: ["challenge": good + "A"]) == nil, "44 chars rejected")
check(AppHandoffLogic.validChallenge(from: ["challenge": String(good.dropLast()) + "="]) == nil, "bad char rejected")
check(AppHandoffLogic.validChallenge(from: ["challenge": String(good.dropLast()) + "é"]) == nil, "non-ascii rejected")
check(AppHandoffLogic.validChallenge(from: ["challenge": 5]) == nil, "non-string rejected")
check(AppHandoffLogic.validChallenge(from: "x") == nil, "non-dict rejected")
check(AppHandoffLogic.validChallenge(from: [String: Any]()) == nil, "missing key rejected")
check(AppHandoffLogic.startURL(challenge: good)?.absoluteString == "https://schedule-kw.com/app-handoff/start?challenge=\(good)", "start URL")
check(AppHandoffLogic.startURL(challenge: "bad") == nil, "start URL rejects bad challenge")

func o(_ s: String) -> AppHandoffLogic.Outcome { AppHandoffLogic.outcome(callbackURL: URL(string: s), error: nil) }
check(o("schedulekw://handoff?code=abc123") == .code("abc123"), "code")
check(o("schedulekw://handoff?error=access_denied") == .error("access_denied"), "error text as is")
check(o("schedulekw://handoff?error=a%20b&code=x") == .error("a b"), "error wins, decoded")
check(o("schedulekw://handoff") == .error("failed"), "no params -> failed")
check(o("schedulekw://handoff?code=") == .error("failed"), "empty code -> failed")
check(AppHandoffLogic.outcome(callbackURL: nil, error: nil) == .error("failed"), "nil url -> failed")
let cancel = NSError(domain: ASWebAuthenticationSessionErrorDomain, code: ASWebAuthenticationSessionError.canceledLogin.rawValue)
check(AppHandoffLogic.outcome(callbackURL: nil, error: cancel) == .error("cancelled"), "canceledLogin -> cancelled")
check(AppHandoffLogic.outcome(callbackURL: nil, error: NSError(domain: "x", code: 1)) == .error("failed"), "other error -> failed")

check(AppHandoffLogic.script(for: .code("abc")) == "window.dispatchEvent(new CustomEvent('app-handoff',{detail:{\"code\":\"abc\"}}))", "script code")
let evil = "');alert(1);//\"\\\u{2028}</script>"
let js = AppHandoffLogic.script(for: .error(evil))
check(js.hasPrefix("window.dispatchEvent(new CustomEvent('app-handoff',{detail:{\"error\":\"") && js.hasSuffix("\"}}))"), "script shape with hostile text")
check(!js.contains("\u{2028}") && js.contains("\\u2028"), "line separator escaped")
check(js.contains("\\\"") && js.contains("\\\\"), "quotes and backslash escaped")
print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
