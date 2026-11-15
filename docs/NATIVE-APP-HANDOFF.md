# تسليمُ الدخول من Safari إلى التطبيق الرسمي

**الفكرة:** من دخل ببطاقته في Safari ثم حمّل التطبيق وفتحه يجد زراً واحداً «ادخل بحسابك». يضغطه فتسأله آبل «متابعة؟»، ويدخل بحسابه، بلا اسم مستخدم ولا كلمة سر.

## ما صار في الموقع (منشور، لا يحتاج تحديث تطبيق)
- `GET /app-handoff/start?challenge=<base64url(sha256(verifier))>` بكوكي Safari ← `302` إلى `schedulekw://handoff?code=…` أو `?error=no-session|password-first|bad-request`.
- `GET /app-handoff/redeem?code=…&verifier=…` داخل غلاف التطبيق ← جلسةٌ جديدة في مخزن التطبيق ثم `/`. الرمز لمرة واحدة ودقيقتين، مربوطٌ بـverifier (PKCE).
- الزر نفسه يرسمه الموقع في شاشة الدخول **حين يجد** `window.webkit.messageHandlers.appHandoff`؛ والتطبيق يردّ بحدثٍ `app-handoff` (انظر العقد).
- دعوةُ «حمّل التطبيق» تظهر في Safari على أجهزة آبل مرةً واحدة، ولا تظهر داخل التطبيق.

## المطلوب في التطبيق (تحديث واحد صغير)

### العقد
1. معالجُ رسائلٍ اسمه `appHandoff` على WKWebView الخاص بـCapacitor. الرسالة: `{ challenge: string }`.
2. عند وصولها يفتح `ASWebAuthenticationSession` على `https://schedule-kw.com/app-handoff/start?challenge=<challenge>` و`callbackURLScheme: "schedulekw"`، و`prefersEphemeralWebBrowserSession = false` (لتشارك كوكيز Safari).
3. يردّ للصفحة بـ`evaluateJavaScript`:
   - نجاح: `window.dispatchEvent(new CustomEvent("app-handoff",{detail:{code:"<code>"}}))`
   - `error=…` في الرابط: `{detail:{error:"<النص نفسه>"}}`
   - ألغى المستخدم (`ASWebAuthenticationSessionError.canceledLogin`): `{detail:{error:"cancelled"}}`
4. لا شيء غير ذلك: الصفحة هي التي تبدّل الرمز بالجلسة، وهي التي تعرض الأخطاء.

### مخطّط Swift (يُكمَّل في `MainViewController.swift`)
```swift
import AuthenticationServices

final class AppHandoff: NSObject, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    weak var webView: WKWebView?
    private var session: ASWebAuthenticationSession?

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let body = m.body as? [String: Any], let challenge = body["challenge"] as? String,
              challenge.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let url = URL(string: "https://schedule-kw.com/app-handoff/start?challenge=\(challenge)") else { return }
        let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "schedulekw") { [weak self] callback, error in
            var detail = "{error:\"failed\"}"
            if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { detail = "{error:\"cancelled\"}" }
            else if let items = callback.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems }) {
                if let code = items.first(where: { $0.name == "code" })?.value { detail = "{code:\"\(code)\"}" }
                else if let err = items.first(where: { $0.name == "error" })?.value { detail = "{error:\"\(err)\"}" }
            }
            DispatchQueue.main.async {
                self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('app-handoff',{detail:\(detail)}))")
            }
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = false
        session = s
        s.start()
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { webView?.window ?? ASPresentationAnchor() }
}
```
التسجيل في `capacitorDidLoad()`: `handoff.webView = bridge?.webView; bridge?.webView?.configuration.userContentController.add(handoff, name: "appHandoff")` (احتفظ بـ`handoff` كخاصيةٍ في المتحكّم).

### الاختبار على جهاز حقيقي
1. في Safari افتح بطاقة (رئيس أو عضو) حتى تدخل. 2. افتح التطبيق: يجب أن يظهر «ادخل بحسابك». 3. اضغطه ← رسالة آبل ← يدخل بحسابه. 4. بلا دخول سابق ← رسالة «افتح بطاقتك من Safari أولاً». 5. كرّر على آيفون وآيباد وماك (النسخة «مصمّمة للآيباد»). على الماك يلزم أن يكون Safari متصفحه الأساسي.
