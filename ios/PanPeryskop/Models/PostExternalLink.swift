import Foundation

enum ExternalLinkTarget: Equatable {
    case inApp(url: URL, allowAnyHost: Bool)
    case systemSafari(url: URL)
}

extension Post {
    var isLocalListEvent: Bool {
        !isRestaurant && (category ?? AppConstants.categoryEvents) == AppConstants.categoryEvents
    }

    var hasStoryBadges: Bool {
        is_sponsored == true || is_sold_out == true || !(tags ?? []).isEmpty
    }

    func preferredURL(selectedShowtime: String? = nil) -> URL? {
        if let time = resolvedShowtime(for: selectedShowtime), let booking = bookingURL(for: time) {
            return booking
        }
        return link_url.flatMap(URL.init)
    }

    func externalLinkTarget(selectedShowtime: String? = nil) -> ExternalLinkTarget? {
        guard let url = preferredURL(selectedShowtime: selectedShowtime), Self.isWebURL(url) else {
            return nil
        }
        if isRun {
            return Self.runLinkTarget(for: url)
        }
        if isRestaurant {
            return .inApp(url: url, allowAnyHost: true)
        }
        if url.host.map(AllowedWebDomains.isAllowed) == true {
            return .inApp(url: url, allowAnyHost: false)
        }
        return .systemSafari(url: url)
    }

    private func resolvedShowtime(for selectedShowtime: String?) -> String? {
        if let selectedShowtime, showtimes?.contains(selectedShowtime) == true {
            return selectedShowtime
        }
        return showtimes?.first
    }

    private static func isWebURL(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        return scheme == "http" || scheme == "https"
    }

    private static func runLinkTarget(for url: URL) -> ExternalLinkTarget {
        if url.host?.lowercased().contains("google.") == true {
            return .systemSafari(url: url)
        }
        return .inApp(url: url, allowAnyHost: true)
    }
}
