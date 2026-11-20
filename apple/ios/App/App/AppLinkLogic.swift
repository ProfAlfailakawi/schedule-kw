import Foundation

/// Pure, UI-free rules for Universal Links, kept apart so they can be unit-tested
/// with a plain `swiftc` run (see apple/tests). Only the member card link (/k/…),
/// the short invitation link (/i/…) and the prefilled invitation link (/#invite=…)
/// are accepted; everything else is ignored and left to the normal navigation.
enum AppLinkLogic {
    static let host = "schedule-kw.com"

    static func destination(for url: URL?) -> URL? {
        guard let url,
              url.scheme == "https",
              url.host?.lowercased() == host,
              url.port == nil, url.user == nil, url.password == nil,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = parts.percentEncodedPath
        let fragment = parts.percentEncodedFragment ?? ""
        let isCard = path.hasPrefix("/k/") && path.count > 3
        let isShortInvite = path.hasPrefix("/i/") && path.count > 3
        let isPrefilledInvite = path == "/" && (fragment.hasPrefix("invite=") || fragment.hasPrefix("invite&"))
        guard isCard || isShortInvite || isPrefilledInvite else { return nil }
        return url
    }

    /// The URL carried by a web-browsing user activity, if it is one of ours.
    static func destination(for activity: NSUserActivity) -> URL? {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb else { return nil }
        return destination(for: activity.webpageURL)
    }
}
