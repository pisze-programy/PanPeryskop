import SwiftUI
import UIKit
import Vision
import XCTest
@testable import PanPeryskop

@MainActor
final class EventsListTests: XCTestCase {
    private static let mapPrefsKeys = ["map.last_city_id", "map.selected_tags", "map.selected_day", "tags.cache"]
    private static let tripsPrefsKeys = ["trips.last_city_id", "trips.selected_tags", "trips.selected_day"]

    override func tearDown() {
        VerifyURLProtocol.handler = nil
        URLProtocol.unregisterClass(VerifyURLProtocol.self)
        super.tearDown()
    }

    func testDateHeaderDayZeroUsesDzisWithoutWeekday() {
        let now = warsawDate(year: 2026, month: 6, day: 15, hour: 9)
        let sameEvening = warsawDate(year: 2026, month: 6, day: 15, hour: 23, minute: 30)
        XCTAssertEqual(EventsDateHeaderFormatter.title(for: sameEvening, now: now), "Dziś, 15 czerwca")
        XCTAssertEqual(EventsDateHeaderFormatter.title(dayOffset: 0, now: now), "Dziś, 15 czerwca")
        XCTAssertEqual(EventsDateHeaderFormatter.title(isoDay: "2026-06-15", now: now), "Dziś, 15 czerwca")
        XCTAssertFalse(EventsDateHeaderFormatter.title(for: now, now: now).lowercased().contains("poniedziałek"))
    }

    func testDateHeaderDayOneUsesJutroWithoutWeekday() {
        let now = warsawDate(year: 2026, month: 6, day: 15, hour: 12)
        let tomorrow = warsawDate(year: 2026, month: 6, day: 16, hour: 18)
        XCTAssertEqual(EventsDateHeaderFormatter.title(for: tomorrow, now: now), "Jutro, 16 czerwca")
        XCTAssertEqual(EventsDateHeaderFormatter.title(dayOffset: 1, now: now), "Jutro, 16 czerwca")
        XCTAssertEqual(EventsDateHeaderFormatter.title(isoDay: "2026-06-16", now: now), "Jutro, 16 czerwca")
        XCTAssertFalse(EventsDateHeaderFormatter.title(for: tomorrow, now: now).lowercased().contains("wtorek"))
    }

    func testDateHeaderDayTwoPlusUsesWeekdayAndNeverPojutrze() {
        let now = warsawDate(year: 2026, month: 6, day: 15, hour: 12)
        let dayTwoTitle = EventsDateHeaderFormatter.title(dayOffset: 2, now: now)
        let dayThreeTitle = EventsDateHeaderFormatter.title(isoDay: "2026-06-18", now: now)
        XCTAssertEqual(dayTwoTitle, "Środa, 17 czerwca")
        XCTAssertEqual(dayThreeTitle, "Czwartek, 18 czerwca")
        XCTAssertFalse(dayTwoTitle.lowercased().contains("pojutrze"))
        XCTAssertEqual(EventsDateHeaderFormatter.title(isoDay: "bad-date", now: now), "bad-date")
    }

    func testIsLocalListEventExcludesRestaurantsAndFood() throws {
        let eventPost = try makePost(id: "e1", category: "events", tags: ["muzyka"])
        let nilCategoryEvent = try makePost(id: "e2", category: nil, tags: nil)
        let restaurantPost = try makePost(id: "r1", category: "events", tags: ["restauracje"])
        let foodPost = try makePost(id: "f1", category: "food", tags: nil)
        XCTAssertTrue(eventPost.isLocalListEvent)
        XCTAssertTrue(nilCategoryEvent.isLocalListEvent)
        XCTAssertFalse(restaurantPost.isLocalListEvent)
        XCTAssertFalse(foodPost.isLocalListEvent)
    }

    func testEffectiveTagsParamFallsBackToVisibleTagsWhenOnlyRestaurantsSelected() {
        let visible = [
            TagPill(id: "muzyka", label: "Muzyka"),
            TagPill(id: "kino", label: "Kino"),
        ]
        XCTAssertNil(LocalEventsListViewModel.effectiveTagsParam(nil, visibleTags: visible))
        XCTAssertNil(LocalEventsListViewModel.effectiveTagsParam("", visibleTags: visible))
        XCTAssertEqual(LocalEventsListViewModel.effectiveTagsParam("restauracje", visibleTags: visible), "kino,muzyka")
        XCTAssertNil(LocalEventsListViewModel.effectiveTagsParam("restauracje", visibleTags: []))
        XCTAssertEqual(LocalEventsListViewModel.effectiveTagsParam("muzyka,restauracje", visibleTags: visible), "muzyka")
        XCTAssertEqual(LocalEventsListViewModel.effectiveTagsParam("sport,muzyka", visibleTags: visible), "sport,muzyka")
    }

    func testProviderSortRankOrdersTimedBeforeUnknownAndPrioritizesSources() throws {
        let earlyUnknownSource = try makePost(id: "p1", description: "Zebra: 18:00, Klub", source: nil)
        let lateLuma = try makePost(id: "p2", description: "Koncert: 21:00, Klub", source: "luma")
        let sameTimeGoing = try makePost(id: "p3", description: "Koncert: 19:00, Klub", source: "going")
        let sameTimeLuma = try makePost(id: "p4", description: "Koncert: 19:00, Klub", source: "luma")
        let sameTimeEventim = try makePost(id: "p5", description: "Koncert: 19:00, Klub", source: "eventim")
        let zeroZeroTime = try makePost(id: "p6", description: "Cały dzień: 00:00, Park", source: "luma")
        let missingTimeOther = try makePost(id: "p7", description: "Wystawa w parku", source: "going")
        let sorted = ProviderSortRank.sort([
            missingTimeOther,
            lateLuma,
            sameTimeEventim,
            zeroZeroTime,
            sameTimeGoing,
            earlyUnknownSource,
            sameTimeLuma,
        ])
        XCTAssertEqual(sorted.map(\.id), ["p1", "p4", "p3", "p5", "p2", "p6", "p7"])
    }

    func testProviderSortRankBreaksEqualTimeAndSourceByTitleThenId() throws {
        let beta = try makePost(id: "id-a", description: "Beta: 20:00, Klub", source: "going")
        let alphaTwo = try makePost(id: "id-2", description: "Alpha: 20:00, Klub", source: "going")
        let alphaOne = try makePost(id: "id-1", description: "Alpha: 20:00, Klub", source: "going")
        let showtimeOverride = try makePost(
            id: "id-early",
            description: "Gamma: 00:00, Kino",
            source: "helios",
            showtimes: ["00:00", "9:5"]
        )
        let sorted = ProviderSortRank.sort([beta, alphaTwo, alphaOne, showtimeOverride])
        XCTAssertEqual(sorted.map(\.id), ["id-early", "id-1", "id-2", "id-a"])
        XCTAssertEqual(ProviderSortRank.effectiveTime(for: showtimeOverride), "09:05")
        XCTAssertNil(ProviderSortRank.normalizedTime("00:00"))
        XCTAssertNil(ProviderSortRank.normalizedTime("25:99"))
    }

    func testProviderSortRankOrdersAllKnownRanks() {
        let ordered = [
            "luma", "going", "kupbilecik", "facebook", "meetup", "ebilet",
            "eventim", "maratonypolskie", "mtp", "residentadvisor", "ra",
            "ticketmaster", "helios", "multikino", "cinemacity", "other",
        ].map { ProviderSortRank.rank(for: $0) }
        XCTAssertLessThan(ordered[0], ordered[1])
        XCTAssertLessThan(ordered[1], ordered[2])
        XCTAssertLessThan(ordered[2], ordered[3])
        XCTAssertLessThan(ordered[3], ordered[4])
        XCTAssertLessThan(ordered[4], ordered[5])
        XCTAssertLessThan(ordered[5], ordered[6])
        XCTAssertLessThan(ordered[6], ordered[7])
        XCTAssertLessThan(ordered[7], ordered[8])
        XCTAssertLessThan(ordered[8], ordered[9])
        XCTAssertEqual(ordered[9], ordered[10])
        XCTAssertLessThan(ordered[10], ordered[11])
        XCTAssertLessThan(ordered[11], ordered[12])
        XCTAssertEqual(ordered[12], ordered[13])
        XCTAssertEqual(ordered[13], ordered[14])
        XCTAssertLessThan(ordered[14], ordered[15])
    }

    func testCityBreakCountrySectionsOrdersCountriesAndCitiesAlphabetically() {
        let cities = [
            makeCity(id: "valencia-es", namePl: "Walencja", countryCode: "ES"),
            makeCity(id: "barcelona-es", namePl: "Barcelona", countryCode: "ES"),
            makeCity(id: "alicante-es", namePl: "Alicante", countryCode: "ES"),
            makeCity(id: "paris-fr", namePl: "Paryż", countryCode: "FR"),
            makeCity(id: "rome-it", namePl: "Rzym", countryCode: "IT"),
            makeCity(id: "lisbon-pt", namePl: "Lizbona", countryCode: "PT"),
            makeCity(id: "london-gb", namePl: "Londyn", countryCode: "GB"),
        ]
        let sections = CityBreakCountrySection.sections(from: cities, language: "pl")
        XCTAssertEqual(sections.map(\.title), ["Francja", "Hiszpania", "Portugalia", "Wielka Brytania", "Włochy"])
        XCTAssertEqual(sections[1].cities.map(\.displayName), ["Alicante", "Barcelona", "Walencja"])
    }

    func testCityBreakRankedCitiesHandlesReachableNaNAndEmptyOriginsSafely() {
        let unreachableTop = makeCity(id: "u1", population: 9_000_000, reachable: false, costLocalUsd: 100, overall: 5.0)
        let nanCity = makeCity(id: "nan", namePl: "NanCity", population: 900_000, costLocalUsd: 1200, overall: .nan)
        let infCity = makeCity(id: "inf", namePl: "InfCity", population: 800_000, costLocalUsd: 1200, overall: .infinity)
        let validCity = makeCity(id: "ok", namePl: "OkCity", population: 400_000, costLocalUsd: 1200, overall: 4.2)
        let sorted = CityBreakCountrySection.rankedCities([unreachableTop, nanCity, infCity, validCity])
        XCTAssertEqual(sorted.map(\.id), ["ok", "nan", "inf", "u1"])
        let dest = Destination(iata: "FCO", name: "Fiumicino", city: "Rome", country: "Italy", lat: 41.8, lng: 12.2, providers: [.ryanair])
        let resolved = TripsViewModel.origin(for: dest, among: [], catalogue: CatalogueStore.shared.catalogue)
        XCTAssertFalse(resolved.iata.isEmpty)
    }

    func testPostEquatableReflectsStateMutations() throws {
        let base = try makePost(id: "p1", isSoldOut: false, showtimes: ["18:00"])
        let same = try makePost(id: "p1", isSoldOut: false, showtimes: ["18:00"])
        XCTAssertEqual(base, same)
        XCTAssertNotEqual(base, base.with(watched: true))
        XCTAssertNotEqual(base, base.with(liked: true))
        XCTAssertNotEqual(base, base.with(disliked: true))
        XCTAssertNotEqual(base, base.with(likesCount: 5))
        let soldOut = try makePost(id: "p1", isSoldOut: true, showtimes: ["18:00"])
        let moreShowtimes = try makePost(id: "p1", isSoldOut: false, showtimes: ["18:00", "20:00"])
        XCTAssertNotEqual(base, soldOut)
        XCTAssertNotEqual(base, moreShowtimes)
    }

    func testAllowedWebDomainsIncludesProviderHostsAndRejectsOthers() {
        XCTAssertTrue(AllowedWebDomains.isAllowed("eventim.pl"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("WWW.EVENTIM.PL"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("awin1.com"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("www.awin1.com"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("mtp.pl"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("facebook.com"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("m.facebook.com"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("fb.me"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("kupbilecik.pl"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("goingapp.pl"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("ebilet.pl"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("ticketmaster.pl"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("ra.co"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("luma.com"))
        XCTAssertTrue(AllowedWebDomains.isAllowed("lu.ma"))
        XCTAssertFalse(AllowedWebDomains.isAllowed("fakeeventim.pl"))
        XCTAssertFalse(AllowedWebDomains.isAllowed("example.com"))
        XCTAssertFalse(AllowedWebDomains.isAllowed("google.com"))
    }

    func testExternalLinkTargetRoutesByDomainRoleAndShowtimeBooking() throws {
        let allowedEvent = try makePost(id: "e1", linkUrl: "https://www.eventim.pl/tickets")
        let externalEvent = try makePost(id: "e2", linkUrl: "https://example.org/tickets")
        let googleRun = try makePost(id: "r1", source: "maratonypolskie", linkUrl: "https://www.google.com/search?q=bieg")
        let directRun = try makePost(id: "r2", source: "maratonypolskie", linkUrl: "https://bieg.example.org/info")
        let restaurant = try makePost(id: "f1", tags: ["restauracje"], linkUrl: "https://bistro.example.org")
        let javascriptPost = try makePost(id: "bad1", linkUrl: "javascript:alert(1)")
        let cinemaPost = try makePost(
            id: "c1",
            source: "cinemacity",
            linkUrl: "https://www.cinema-city.pl/fallback",
            showtimes: ["18:00", "20:15"],
            showtimeBooking: [
                ["time": "20:15", "kind": "cinemacity", "params": ["order": "999", "cinema": "1074"]]
            ]
        )
        XCTAssertEqual(allowedEvent.externalLinkTarget(), .inApp(url: URL(string: "https://www.eventim.pl/tickets")!, allowAnyHost: false))
        XCTAssertEqual(externalEvent.externalLinkTarget(), .systemSafari(url: URL(string: "https://example.org/tickets")!))
        XCTAssertEqual(googleRun.externalLinkTarget(), .systemSafari(url: URL(string: "https://www.google.com/search?q=bieg")!))
        XCTAssertEqual(directRun.externalLinkTarget(), .inApp(url: URL(string: "https://bieg.example.org/info")!, allowAnyHost: true))
        XCTAssertEqual(restaurant.externalLinkTarget(), .inApp(url: URL(string: "https://bistro.example.org")!, allowAnyHost: true))
        XCTAssertNil(javascriptPost.externalLinkTarget())
        XCTAssertEqual(
            cinemaPost.externalLinkTarget(selectedShowtime: "20:15"),
            .inApp(url: URL(string: "https://tickets.cinema-city.pl/order/999?lang=pl&x-cinema=1074")!, allowAnyHost: false)
        )
        XCTAssertEqual(
            cinemaPost.externalLinkTarget(selectedShowtime: "18:00"),
            .inApp(url: URL(string: "https://www.cinema-city.pl/fallback")!, allowAnyHost: false)
        )
    }

    func testCityThumbStoreConcurrentLoadAndCancel() async {
        let urls = Bundle.main.urls(forResourcesWithExtension: "webp", subdirectory: "CityThumbs") ?? []
        XCTAssertGreaterThanOrEqual(urls.count, 40)
        let ids = Array(urls.prefix(48)).map { $0.deletingPathExtension().lastPathComponent }
        let tasks = ids.map { id in
            Task { await CityThumbStore.load(id) }
        }
        cancelOddTasks(tasks)
        let loaded = await collectOptionalImages(tasks)
        XCTAssertEqual(loaded.count, ids.count)
    }

    func testRemoteImageStoreConcurrentLoadAndCancel() async {
        let pngData = makeTinyPNGData()
        registerVerifyStub { request in
            (Self.okResponse(for: request), pngData)
        }
        let urls = (0..<40).compactMap { index in
            URL(string: "https://api.panperyskop.app/verify-img/\(index).png")
        }
        let tasks = urls.map { url in
            Task { await RemoteImageStore.shared.load(url) }
        }
        cancelOddTasks(tasks)
        let loaded = await collectOptionalImages(tasks)
        XCTAssertEqual(loaded.count, urls.count)
    }

    func testLocalEventsListViewModelClampsStartDayOffsetAndReloadsOnChange() async throws {
        let recorder = RequestRecorder()
        let dayTwoIso = dayIsoString(offset: 2)
        let samplePayload = try encodePostsJSON([
            makePostDict(id: "d2-1", description: "Koncert Jazzowy: 19:30, Stodoła", tags: ["muzyka"])
        ])
        let emptyPayload = Data("{\"stories\":[]}".utf8)
        registerVerifyStub { request in
            let day = Self.queryParam("day", in: request)
            recorder.record(path: request.url?.path ?? "", day: day)
            let body = day == dayTwoIso ? samplePayload : emptyPayload
            return (Self.okResponse(for: request), body)
        }
        let vm = LocalEventsListViewModel()
        let city = CatalogueStore.shared.defaultCity
        vm.loadIfNeeded(city: city, tags: nil, startDayOffset: -5)
        await waitUntil { !vm.isInitialLoading && !vm.isLoadingMore }
        let countAfterInitial = recorder.days(for: "/stories").count
        XCTAssertTrue(recorder.days(for: "/stories").contains(dayIsoString(offset: 0)))
        XCTAssertTrue(recorder.days(for: "/stories").contains(dayIsoString(offset: LocalEventsListViewModel.maxDayOffset)))
        XCTAssertEqual(vm.tagCounts["muzyka"], 1)
        vm.loadIfNeeded(city: city, tags: nil, startDayOffset: 0)
        XCTAssertEqual(recorder.days(for: "/stories").count, countAfterInitial)
        vm.loadIfNeeded(city: city, tags: nil, startDayOffset: 99)
        await waitUntil { !vm.isInitialLoading && !vm.isLoadingMore }
        XCTAssertEqual(recorder.days(for: "/stories").count, countAfterInitial)
        vm.loadIfNeeded(city: city, tags: nil, startDayOffset: 2)
        await waitUntil { !vm.isInitialLoading && !vm.isLoadingMore && !vm.sections.isEmpty }
        XCTAssertEqual(vm.sections.first?.dayOffset, 2)
        XCTAssertEqual(vm.sections.first?.isoDay, dayTwoIso)
        vm.syncTags(["kino"])
        XCTAssertTrue(vm.sections.isEmpty)
        XCTAssertEqual(vm.tagCounts["muzyka"], 1)
        vm.syncTags(["muzyka"])
        XCTAssertEqual(vm.sections.first?.isoDay, dayTwoIso)
        XCTAssertEqual(recorder.days(for: "/stories").count, countAfterInitial)
    }

    func testLocalEventsListViewStickyFilterAndFullWidthMultiShowtimeCards() async throws {
        clearPrefs(Self.mapPrefsKeys)
        let day0 = dayIsoString(offset: 0)
        let day1 = dayIsoString(offset: 1)
        let day0Payload = try encodePostsJSON([
            makePostDict(
                id: "multi-1",
                description: "Festiwal Kina: 18:30, Kinoteka",
                tags: ["kino"],
                source: "cinemacity",
                showtimes: ["18:30", "21:00"]
            ),
            makePostDict(
                id: "single-1",
                description: "Dawid Podsiadło na żywo: 20:00, PGE Narodowy",
                tags: ["muzyka"],
                isSponsored: true,
                source: "ebilet"
            ),
            makePostDict(
                id: "sold-1",
                description: "Gala Stand-up: 21:30, Teatr Palladium",
                tags: ["imprezy"],
                isSoldOut: true,
                source: "going"
            ),
        ])
        let day1Payload = try encodePostsJSON([
            makePostDict(
                id: "day1-1",
                description: "Noc Muzeów w Warszawie: 00:00, Centrum",
                tags: ["kultura"],
                source: "facebook"
            )
        ])
        let emptyPayload = Data("{\"stories\":[]}".utf8)
        let tagsPayload = Data("""
        {"tags":[
          {"id":"muzyka","label":"Koncerty"},
          {"id":"kino","label":"Kino"},
          {"id":"imprezy","label":"Imprezy"},
          {"id":"kultura","label":"Kultura"},
          {"id":"sport","label":"Sport"},
          {"id":"restauracje","label":"Restauracje"}
        ]}
        """.utf8)
        registerVerifyStub { request in
            Self.routeLocalStub(
                request: request,
                tagsPayload: tagsPayload,
                day0: day0,
                day1: day1,
                day0Payload: day0Payload,
                day1Payload: day1Payload,
                emptyPayload: emptyPayload
            )
        }
        let mapVM = MapViewModel()
        let listVM = LocalEventsListViewModel()
        await waitUntil { !mapVM.tags.isEmpty }
        let view = LocalEventsListView(
            mapViewModel: mapVM,
            listViewModel: listVM,
            onCityTap: {},
            onDayTap: {},
            onSelectPost: { _, _ in }
        )
        let result = await renderAndSnapshot(view) {
            !listVM.sections.isEmpty && !listVM.isInitialLoading && !listVM.isLoadingMore
        }
        let scrollViews = result.views.compactMap { $0 as? UIScrollView }
        let horizontalFilterBars = scrollViews.filter { $0.frame.height > 25 && $0.frame.height < 120 && $0.frame.width > 300 }
        XCTAssertFalse(horizontalFilterBars.isEmpty)
        XCTAssertEqual(listVM.tagCounts["muzyka"], 1)
        XCTAssertEqual(listVM.tagCounts["kino"], 1)
        XCTAssertEqual(listVM.tagCounts["imprezy"], 1)
        XCTAssertEqual(listVM.tagCounts["kultura"], 1)
        XCTAssertTrue(result.labels.contains { $0.contains("Warszawa") })
        XCTAssertTrue(result.labels.contains { $0.contains("Dziś") })
        XCTAssertTrue(result.labels.contains { $0.contains("Imprezy") })
        XCTAssertTrue(result.labels.contains { $0.uppercased().contains("KONCERTY") })
        XCTAssertTrue(result.labels.contains { $0.contains("18:30") })
        XCTAssertTrue(result.labels.contains { $0.contains("WYPRZEDANE") })
        XCTAssertFalse(result.labels.contains { $0.uppercased().contains("SPONSOROWANE") })
        XCTAssertFalse(result.labels.contains { $0.lowercased().contains("termin") })
        XCTAssertFalse(result.labels.contains { $0.contains("21:00") })
        try assertCompactClockThumbnailAndNoCardScroll()
        result.window.isHidden = true
    }

    func testEuropaEventCountryGroupOrdersCountriesAlphabeticallyInPolish() {
        let baseMs = Int64(Date().timeIntervalSince1970 * 1000)
        let ukEvent = TravelEvent(
            provider: "espn",
            external_id: "uk-1",
            title: "Arsenal vs Chelsea",
            lat: 51.5,
            lng: -0.1,
            city: "Londyn",
            country: "United Kingdom",
            start_ms: baseMs,
            tag: TripsViewModel.TravelTag.football.rawValue,
            link: nil,
            meta: #"{"countryCode":"GB","time":"20:00"}"#,
            reachableAirports: ["STN"],
            reachableCarriers: nil
        )
        let italyLate = TravelEvent(
            provider: "espn",
            external_id: "it-2",
            title: "Milan vs Inter",
            lat: 45.4,
            lng: 9.1,
            city: "Mediolan",
            country: "Italy",
            start_ms: baseMs + 3_600_000,
            tag: TripsViewModel.TravelTag.football.rawValue,
            link: nil,
            meta: #"{"countryCode":"IT","time":"20:45"}"#,
            reachableAirports: ["BGY"],
            reachableCarriers: nil
        )
        let spainEvent = TravelEvent(
            provider: "maratonypolskie",
            external_id: "es-1",
            title: "Bieg Madryt",
            lat: 40.4,
            lng: -3.7,
            city: "Madryt",
            country: "Spain",
            start_ms: baseMs,
            tag: TripsViewModel.TravelTag.runs.rawValue,
            link: nil,
            meta: #"{"countryCode":"ES","time":"09:00"}"#,
            reachableAirports: ["MAD"],
            reachableCarriers: nil
        )
        let italyEarly = TravelEvent(
            provider: "espn",
            external_id: "it-1",
            title: "Roma vs Lazio",
            lat: 41.9,
            lng: 12.4,
            city: "Rzym",
            country: "Italy",
            start_ms: baseMs,
            tag: TripsViewModel.TravelTag.football.rawValue,
            link: nil,
            meta: #"{"countryCode":"IT","time":"18:00"}"#,
            reachableAirports: ["CIA"],
            reachableCarriers: nil
        )
        let groups = EuropaEventCountryGroup.groups(
            from: [ukEvent, italyEarly, spainEvent, italyLate],
            language: "pl"
        )
        XCTAssertEqual(groups.map(\.title), ["Hiszpania", "Wielka Brytania", "Włochy"])
        XCTAssertEqual(groups[2].events.map(\.external_id), ["it-1", "it-2"])
        let flatItems = EuropaEventCountryGroup.sectionItems(
            from: [ukEvent, italyEarly, spainEvent, italyLate],
            sectionId: "2026-11-26",
            language: "pl",
            isLastSection: false
        )
        XCTAssertEqual(flatItems.count, 7)
    }

    func testEuropaViewsSortSheetAndVisualScreenshots() async throws {
        clearPrefs(Self.tripsPrefsKeys)
        let sampleCities = makeShowcaseCities()
        await prewarmCityThumbs(sampleCities)
        let cityIds = sampleCities.map(\.id)
        let matchTimeMs = Int64(Date().timeIntervalSince1970 * 1000)
        let day0Iso = dayIsoString(offset: 0)
        let day1Iso = dayIsoString(offset: 1)
        let matchMeta = #"{"time":"20:45","date":"\#(day0Iso)","league":"UEFA Champions League","homeCode":"ARS","awayCode":"RMA","homeColor":"EF0107","awayColor":"FEBE10","countryCode":"GB"}"#
        let runMeta = #"{"time":"09:00","date":"\#(day1Iso)","distances":["5 km","10 km","Półmaraton"],"countryCode":"ES"}"#
        let matchEvent = TravelEvent(
            provider: "espn",
            external_id: "m1",
            title: "Arsenal vs Real Madrid",
            lat: 51.5549,
            lng: -0.1084,
            city: "Londyn",
            country: "United Kingdom",
            start_ms: matchTimeMs,
            tag: TripsViewModel.TravelTag.football.rawValue,
            link: "https://example.com/match",
            meta: matchMeta,
            reachableAirports: ["LHR"],
            reachableCarriers: ["LHR": ["ryanair", "wizzair"]],
            venueIsAirport: false
        )
        let runEvent = TravelEvent(
            provider: "maratonypolskie",
            external_id: "r1",
            title: "Maraton Walencja",
            lat: 39.4699,
            lng: -0.3763,
            city: "Walencja",
            country: "Spain",
            start_ms: matchTimeMs + 86_400_000,
            tag: TripsViewModel.TravelTag.runs.rawValue,
            link: "https://example.com/run",
            meta: runMeta,
            reachableAirports: ["VLC"],
            reachableCarriers: ["VLC": ["ryanair"]],
            venueIsAirport: false
        )
        let citiesPayload = try JSONEncoder().encode(TravelCitiesResponse(cities: sampleCities))
        let day0From = dayRangeStartMs(offset: 0)
        let day0To = dayRangeEndMs(offset: 0)
        let day1From = dayRangeStartMs(offset: 1)
        let day1To = dayRangeEndMs(offset: 1)
        let day0EventsPayload = try encodeEventsJSON([matchEvent])
        let day1EventsPayload = try encodeEventsJSON([runEvent])
        let bothEventsPayload = try encodeEventsJSON([matchEvent, runEvent])
        let emptyEventsPayload = Data(#"{"events":[],"enriched":true}"#.utf8)
        registerVerifyStub { request in
            Self.routeEuropaStub(
                request: request,
                citiesPayload: citiesPayload,
                day0From: day0From,
                day0To: day0To,
                day1From: day1From,
                day1To: day1To,
                day0EventsPayload: day0EventsPayload,
                day1EventsPayload: day1EventsPayload,
                bothEventsPayload: bothEventsPayload,
                emptyEventsPayload: emptyEventsPayload
            )
        }
        let mapVM = MapViewModel()
        let tripsVM = TripsViewModel()
        await waitUntil { tripsVM.cities.count == cityIds.count }
        let mixedScreen = EventsListScreen(
            mapViewModel: mapVM,
            tripsViewModel: tripsVM,
            category: .trips,
            onSelectCity: { _ in },
            isShowingSublist: .constant(false),
            popToRootToken: 0
        )
        let mixedResult = await renderAndSnapshot(
            mixedScreen,
            settleSeconds: 0.65
        )
        XCTAssertTrue(mixedResult.labels.contains { $0.contains("City Break") })
        XCTAssertTrue(mixedResult.labels.contains { $0.contains("Zobacz więcej (5)") })
        XCTAssertTrue(mixedResult.labels.contains { $0.contains("Wielka Brytania") })
        XCTAssertFalse(mixedResult.labels.contains { $0 == TripsViewModel.TravelTag.citybreak.label })
        XCTAssertFalse(mixedResult.labels.contains { $0.contains("Polecane kierunki") })
        XCTAssertFalse(mixedResult.labels.contains { $0.contains("Koszta życia") })
        XCTAssertFalse(mixedResult.labels.contains { $0.lowercased().contains("ryanair") })
        assertZeroBannedLabels(in: mixedResult.labels)
        mixedResult.window.isHidden = true

        tripsVM.toggleTag("biegi")
        tripsVM.toggleTag("pilka-nozna")
        let fallbackEventsResult = await renderAndSnapshot(
            mixedScreen,
            settleSeconds: 0.35
        )
        XCTAssertFalse(fallbackEventsResult.views.isEmpty)
        XCTAssertTrue(fallbackEventsResult.labels.contains { $0.contains("City Break") })
        XCTAssertTrue(fallbackEventsResult.labels.contains { $0.contains("Barcelona") })
        assertZeroBannedLabels(in: fallbackEventsResult.labels)
        fallbackEventsResult.window.isHidden = true
        tripsVM.toggleTag("biegi")
        tripsVM.toggleTag("pilka-nozna")

        let cityBreakView = CityBreakListView(
            tripsViewModel: tripsVM,
            onCityTap: {},
            onDayTap: {},
            onBack: {}
        )
        let cityBreakResult = await renderAndSnapshot(
            cityBreakView,
            settleSeconds: 0.4
        )
        XCTAssertTrue(cityBreakResult.labels.contains { $0.contains("City Break") })
        XCTAssertTrue(cityBreakResult.labels.contains { $0.contains("Kraje") })
        XCTAssertTrue(cityBreakResult.labels.contains { $0.contains("Francja") })
        XCTAssertTrue(cityBreakResult.labels.contains { $0.contains("Hiszpania") })
        XCTAssertTrue(cityBreakResult.labels.contains { $0.contains("Barcelona") })
        XCTAssertFalse(cityBreakResult.labels.contains { $0.contains("Polecane kierunki") })
        XCTAssertFalse(cityBreakResult.labels.contains { $0.lowercased().contains("ryanair") })
        assertZeroBannedLabels(in: cityBreakResult.labels)
        cityBreakResult.window.isHidden = true

        let sections = CityBreakCountrySection.sections(from: sampleCities, language: "pl")
        let filterSheet = CityBreakCountryFilterSheet(
            sections: sections,
            initialSelectedIds: Set(sections.map(\.id))
        ) { _ in }
        let sheetResult = await renderAndSnapshot(
            filterSheet,
            size: CGSize(width: 393, height: 600),
            settleSeconds: 0.25
        )
        XCTAssertTrue(sheetResult.labels.contains { $0.contains("Anuluj") })
        XCTAssertTrue(sheetResult.labels.contains { $0.contains("Zatwierdź") })
        XCTAssertTrue(sheetResult.labels.contains { $0.contains("Hiszpania") })
        sheetResult.window.isHidden = true

        let standaloneCards = VStack(spacing: Theme.Spacing.m) {
            EuropaCityRowCard(
                city: sampleCities[0],
                originIatas: ["WAW", "WMI"]
            ) {}
            EuropaEventRowCard(event: matchEvent) {}
            EuropaEventRowCard(event: runEvent) {}
        }
        .padding(Theme.Spacing.l)
        .background(Color(.systemGroupedBackground))
        let cardsWindow = await renderAndSnapshot(
            standaloneCards,
            size: CGSize(width: 393, height: 420),
            settleSeconds: 0.25
        )
        XCTAssertTrue(cardsWindow.labels.contains { $0.contains("Barcelona") })
        XCTAssertTrue(cardsWindow.labels.contains { $0.contains("Arsenal") })
        XCTAssertTrue(cardsWindow.labels.contains { $0.contains("Maraton") })
        XCTAssertFalse(cardsWindow.labels.contains { $0.lowercased().contains("ryanair") })
        assertZeroBannedLabels(in: cardsWindow.labels)
        cardsWindow.window.isHidden = true

        tripsVM.selectGroup(posts: [], cities: [sampleCities[0]])
        let clusterResult = await renderAndSnapshot(
            ClusterSheet(viewModel: tripsVM),
            size: CGSize(width: 393, height: 700),
            settleSeconds: 0.45
        )
        XCTAssertFalse(clusterResult.views.isEmpty)
        clusterResult.window.isHidden = true
    }

    private func assertCompactClockThumbnailAndNoCardScroll() throws {
        let post = try makePost(
            id: "width-check",
            description: "Koncert Wieczorny: 18:30, Arena",
            tags: ["muzyka"],
            source: "going",
            showtimes: ["18:30", "18:30", "00:00", "21:00", "22:30"]
        )
        XCTAssertEqual(ProviderSortRank.validShowtimes(for: post), ["18:30", "21:00", "22:30"])
        XCTAssertEqual(EventRowThumbnail.posterWidth, 108)
        XCTAssertEqual(EventRowThumbnail.posterHeight, 144)
        let tags = [TagPill(id: "muzyka", label: "Koncerty")]
        let card = EventRowCard(post: post, tags: tags) { _, _ in }
            .padding(.horizontal, Theme.Spacing.l)
        let host = UIHostingController(rootView: card.frame(width: 393, height: 220))
        host.overrideUserInterfaceStyle = .light
        let window = makeWindow()
        window.overrideUserInterfaceStyle = .light
        let container = UIViewController()
        container.overrideUserInterfaceStyle = .light
        container.addChild(host)
        container.view.addSubview(host.view)
        host.view.frame = CGRect(x: 0, y: 0, width: 393, height: 220)
        host.didMove(toParent: container)
        window.rootViewController = container
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        let scrollViews = allSubviews(of: host.view).compactMap { $0 as? UIScrollView }
        XCTAssertTrue(scrollViews.filter { $0.frame.width > 200 }.isEmpty)
        let clockPagerScroll = scrollViews.first { $0.contentSize.width > $0.frame.width }
        XCTAssertNotNil(clockPagerScroll)
        XCTAssertLessThanOrEqual(clockPagerScroll?.frame.width ?? 999, EventRowThumbnail.posterWidth + 2)
        let labels = accessibilityStrings(in: host.view)
        XCTAssertTrue(labels.contains { $0.contains("18:30") })
        XCTAssertFalse(labels.contains { $0.contains("21:00") })
        XCTAssertFalse(labels.contains { $0.contains("22:30") })
        XCTAssertFalse(labels.contains { $0.lowercased().contains("termin") })
        window.isHidden = true
    }

    private func assertZeroBannedLabels(in labels: [String]) {
        XCTAssertFalse(labels.contains { $0.contains("Świetnie") })
        XCTAssertFalse(labels.contains { $0.contains("Bardzo dobrze") })
        XCTAssertFalse(labels.contains { $0.contains("°C") })
        XCTAssertFalse(labels.contains { $0.contains("zł / dzień") })
        XCTAssertFalse(labels.contains { $0.contains("Budżet") })
    }

    private func renderAndSnapshot<V: View>(
        _ view: V,
        size: CGSize = CGSize(width: 393, height: 852),
        settleSeconds: TimeInterval = 0.35,
        ready: (() -> Bool)? = nil
    ) async -> (window: UIWindow, views: [UIView], labels: [String]) {
        let controller = UIHostingController(rootView: view.frame(width: size.width, height: size.height))
        controller.overrideUserInterfaceStyle = .light
        let container = UIViewController()
        container.overrideUserInterfaceStyle = .light
        container.view.backgroundColor = .systemGroupedBackground
        container.addChild(controller)
        container.view.addSubview(controller.view)
        controller.view.frame = CGRect(origin: .zero, size: size)
        controller.didMove(toParent: container)
        let window = makeWindow()
        window.overrideUserInterfaceStyle = .light
        window.rootViewController = container
        window.makeKeyAndVisible()
        controller.view.frame = CGRect(origin: .zero, size: size)
        controller.view.layoutIfNeeded()
        await waitUntilReady(ready, fallbackSeconds: settleSeconds)
        controller.view.frame = CGRect(origin: .zero, size: size)
        controller.view.layoutIfNeeded()
        try? await Task.sleep(for: .milliseconds(250))
        let image = renderImage(from: controller.view, bounds: CGRect(origin: .zero, size: size))
        let labels = accessibilityStrings(in: controller.view) + recognizeText(in: image)
        return (window, allSubviews(of: controller.view), labels)
    }

    private func waitUntilReady(_ ready: (() -> Bool)?, fallbackSeconds: TimeInterval) async {
        if let ready {
            await waitUntil(condition: ready)
            return
        }
        try? await Task.sleep(for: .seconds(fallbackSeconds))
    }



    private func renderImage(from view: UIView, bounds: CGRect) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2.0
        let renderer = UIGraphicsImageRenderer(bounds: bounds, format: format)
        return renderer.image { _ in
            view.drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
    }

    private func recognizeText(in image: UIImage) -> [String] {
        guard let cgImage = image.cgImage else { return [] }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["pl-PL", "en-US"]
        request.usesLanguageCorrection = false
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try? handler.perform([request])
        let observations = request.results ?? []
        return observations.compactMap { $0.topCandidates(1).first?.string }
    }

    private func makeWindow() -> UIWindow {
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            return UIWindow(windowScene: scene)
        }
        return UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
    }

    private func allSubviews(of root: UIView) -> [UIView] {
        [root] + root.subviews.flatMap(allSubviews)
    }

    private func allAccessibilityNodes(in root: UIView) -> [NSObject] {
        allSubviews(of: root).flatMap(directAccessibilityNodes)
    }

    private func directAccessibilityNodes(of view: UIView) -> [NSObject] {
        if let list = view.accessibilityElements as? [NSObject] {
            return [view] + list
        }
        let count = view.accessibilityElementCount()
        guard count > 0, count != NSNotFound else { return [view] }
        let items = (0..<count).compactMap { view.accessibilityElement(at: $0) as? NSObject }
        return [view] + items
    }

    private func accessibilityStrings(in root: UIView) -> [String] {
        allAccessibilityNodes(in: root).compactMap { node in
            node.accessibilityLabel ?? (node as? UILabel)?.text
        }
    }

    private func waitUntil(attempts: Int = 80, condition: () -> Bool) async {
        guard !condition(), attempts > 0 else { return }
        try? await Task.sleep(for: .milliseconds(25))
        await waitUntil(attempts: attempts - 1, condition: condition)
    }

    private func prewarmCityThumbs(_ cities: [TravelCity]) async {
        for city in cities {
            _ = await CityThumbStore.load(city.id)
        }
    }

    private func cancelOddTasks<T>(_ tasks: [Task<T, Never>]) {
        for (index, task) in tasks.enumerated() {
            cancelIfOdd(index: index, task: task)
        }
    }

    private func cancelIfOdd<T>(index: Int, task: Task<T, Never>) {
        guard index % 2 == 1 else { return }
        task.cancel()
    }

    private func collectOptionalImages(_ tasks: [Task<UIImage?, Never>]) async -> [UIImage?] {
        var result: [UIImage?] = []
        for task in tasks {
            result.append(await task.value)
        }
        return result
    }

    private func registerVerifyStub(_ handler: @escaping @Sendable (URLRequest) -> (HTTPURLResponse, Data)) {
        VerifyURLProtocol.handler = handler
        URLProtocol.registerClass(VerifyURLProtocol.self)
    }

    private func clearPrefs(_ keys: [String]) {
        for key in keys {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    private nonisolated static func okResponse(for request: URLRequest) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
    }

    private nonisolated static func routeLocalStub(
        request: URLRequest,
        tagsPayload: Data,
        day0: String,
        day1: String,
        day0Payload: Data,
        day1Payload: Data,
        emptyPayload: Data
    ) -> (HTTPURLResponse, Data) {
        let path = request.url?.path ?? ""
        if path == "/stories/tags" || path == "/tags" { return (okResponse(for: request), tagsPayload) }
        if path == "/stories/tag-counts" { return (okResponse(for: request), Data("{\"total\":4,\"counts\":[]}".utf8)) }
        let day = queryParam("day", in: request)
        let body = day == day0 ? day0Payload : (day == day1 ? day1Payload : emptyPayload)
        return (okResponse(for: request), body)
    }

    private nonisolated static func routeEuropaStub(
        request: URLRequest,
        citiesPayload: Data,
        day0From: Int64,
        day0To: Int64,
        day1From: Int64,
        day1To: Int64,
        day0EventsPayload: Data,
        day1EventsPayload: Data,
        bothEventsPayload: Data,
        emptyEventsPayload: Data
    ) -> (HTTPURLResponse, Data) {
        let path = request.url?.path ?? ""
        if path == "/stories/tags" { return (okResponse(for: request), Data(#"{"tags":[]}"#.utf8)) }
        if path == "/stories/tag-counts" { return (okResponse(for: request), Data(#"{"total":0,"counts":[]}"#.utf8)) }
        if path == "/travel/cities" { return (okResponse(for: request), citiesPayload) }
        if path == "/travel/events" {
            return (
                okResponse(for: request),
                stubEventsPayload(
                    request: request,
                    day0From: day0From,
                    day0To: day0To,
                    day1From: day1From,
                    day1To: day1To,
                    day0EventsPayload: day0EventsPayload,
                    day1EventsPayload: day1EventsPayload,
                    bothEventsPayload: bothEventsPayload,
                    emptyEventsPayload: emptyEventsPayload
                )
            )
        }
        if path.hasPrefix("/travel/flights/") { return (okResponse(for: request), Data(#"{"outbound":[],"returning":[]}"#.utf8)) }
        return (okResponse(for: request), Data("{}".utf8))
    }

    private nonisolated static func stubEventsPayload(
        request: URLRequest,
        day0From: Int64,
        day0To: Int64,
        day1From: Int64,
        day1To: Int64,
        day0EventsPayload: Data,
        day1EventsPayload: Data,
        bothEventsPayload: Data,
        emptyEventsPayload: Data
    ) -> Data {
        let fromMs = Int64(queryParam("from", in: request) ?? "") ?? 0
        let toMs = Int64(queryParam("to", in: request) ?? "") ?? fromMs
        let hasDay0 = fromMs <= day0To && toMs >= day0From
        let hasDay1 = fromMs <= day1To && toMs >= day1From
        if hasDay0 && hasDay1 { return bothEventsPayload }
        if hasDay0 { return day0EventsPayload }
        if hasDay1 { return day1EventsPayload }
        return emptyEventsPayload
    }

    private nonisolated static func queryParam(_ name: String, in request: URLRequest) -> String? {
        guard let url = request.url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        return components.queryItems?.first { $0.name == name }?.value
    }

    private func makeTinyPNGData() -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4))
        let image = renderer.image { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
        return image.pngData() ?? Data()
    }

    private func dayIsoString(offset: Int) -> String {
        let calendar = AppConstants.warsawCalendar
        let target = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: Date())) ?? Date()
        return AppConstants.isoDayFormatter.string(from: target)
    }

    private func dayRangeStartMs(offset: Int) -> Int64 {
        let calendar = AppConstants.warsawCalendar
        let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: Date()))!
        return Int64(day.timeIntervalSince1970 * 1000)
    }

    private func dayRangeEndMs(offset: Int) -> Int64 {
        let calendar = AppConstants.warsawCalendar
        let day = calendar.date(byAdding: .day, value: offset + 1, to: calendar.startOfDay(for: Date()))!
        return Int64(day.timeIntervalSince1970 * 1000) - 1
    }

    private func makeShowcaseCities() -> [TravelCity] {
        [
            makeCity(id: "barcelona-spain", namePl: "Barcelona", countryCode: "ES", population: 1_620_000, costLocalUsd: 2100, overall: 4.8, connections: [CityConnection(iata: "BCN", carriers: ["ryanair", "wizzair"])]),
            makeCity(id: "rome-italy", namePl: "Rzym", countryCode: "IT", population: 2_873_000, costLocalUsd: 1950, overall: 4.7, connections: [CityConnection(iata: "FCO", carriers: ["ryanair", "wizzair"])]),
            makeCity(id: "lisbon-portugal", namePl: "Lizbona", countryCode: "PT", population: 545_000, costLocalUsd: 1700, overall: 4.6, connections: [CityConnection(iata: "LIS", carriers: ["ryanair"])]),
            makeCity(id: "paris-france", namePl: "Paryż", countryCode: "FR", population: 2_161_000, costLocalUsd: 2600, overall: 4.5, connections: [CityConnection(iata: "BVA", carriers: ["ryanair"])]),
            makeCity(id: "london-united-kingdom", namePl: "Londyn", countryCode: "GB", population: 8_982_000, costLocalUsd: 2800, overall: 4.4, connections: [CityConnection(iata: "STN", carriers: ["ryanair", "wizzair"])]),
        ]
    }

    private func warsawDate(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0) -> Date {
        var components = DateComponents()
        components.calendar = AppConstants.warsawCalendar
        components.timeZone = AppConstants.warsawTimeZone
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        return AppConstants.warsawCalendar.date(from: components)!
    }

    private func makePostDict(
        id: String,
        description: String,
        tags: [String]? = nil,
        isSponsored: Bool? = nil,
        isSoldOut: Bool? = nil,
        source: String? = nil,
        showtimes: [String]? = nil
    ) -> [String: Any] {
        let raw: [String: Any?] = [
            "id": id,
            "user_id": "seed",
            "type": "photo",
            "lat": 52.2297,
            "lng": 21.0122,
            "description": description,
            "created_at": Int64(Date().timeIntervalSince1970 * 1000),
            "likes_count": 0,
            "views_count": 0,
            "shares_count": 0,
            "dislikes_count": 0,
            "liked": false,
            "disliked": false,
            "watched": false,
            "author_name": "seed",
            "category": "events",
            "tags": tags,
            "is_sponsored": isSponsored,
            "is_sold_out": isSoldOut,
            "source": source,
            "showtimes": showtimes,
        ]
        return raw.compactMapValues { $0 }
    }

    private func encodePostsJSON(_ items: [[String: Any]]) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["stories": items])
    }

    private func encodeEventsJSON(_ events: [TravelEvent]) throws -> Data {
        let encoded = try JSONEncoder().encode(events)
        let raw = try JSONSerialization.jsonObject(with: encoded)
        return try JSONSerialization.data(withJSONObject: ["events": raw, "enriched": true])
    }

    private func makePost(
        id: String,
        description: String = "Koncert: 18:00, Klub",
        category: String? = "events",
        tags: [String]? = nil,
        source: String? = nil,
        linkUrl: String? = nil,
        isSoldOut: Bool? = nil,
        showtimes: [String]? = nil,
        showtimeBooking: [[String: Any]]? = nil
    ) throws -> Post {
        let raw: [String: Any?] = [
            "id": id,
            "user_id": "seed",
            "type": "photo",
            "lat": 52.2297,
            "lng": 21.0122,
            "description": description,
            "created_at": 0,
            "likes_count": 0,
            "views_count": 0,
            "shares_count": 0,
            "dislikes_count": 0,
            "liked": false,
            "disliked": false,
            "watched": false,
            "author_name": "seed",
            "category": category,
            "tags": tags,
            "source": source,
            "link_url": linkUrl,
            "is_sold_out": isSoldOut,
            "showtimes": showtimes,
            "showtime_booking": showtimeBooking,
        ]
        let payload = raw.compactMapValues { $0 }
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(Post.self, from: data)
    }

    private func makeCity(
        id: String,
        namePl: String? = nil,
        countryCode: String = "XX",
        population: Int = 500_000,
        reachable: Bool = true,
        costLocalUsd: Int = 1200,
        overall: Double? = 4.0,
        connections: [CityConnection] = []
    ) -> TravelCity {
        TravelCity(
            id: id,
            name: id,
            namePl: namePl ?? id.capitalized,
            country: "Country",
            countryCode: countryCode,
            lat: 50.0,
            lng: 10.0,
            bandRank: 1,
            costUsd: costLocalUsd,
            population: population,
            imageUrl: "https://example.com/\(id).jpg",
            imageLargeUrl: "https://example.com/\(id)-large.jpg",
            imageCredit: nil,
            videoUrl: nil,
            nearby: [],
            next: [],
            similar: [],
            facts: makeFacts(costLocalUsd: costLocalUsd, overall: overall),
            airports: connections.map(\.iata),
            reachable: reachable,
            connections: connections,
            season: nil
        )
    }

    private func makeFacts(costLocalUsd: Int, overall: Double?) -> CityFacts {
        CityFacts(
            costLocalUsd: costLocalUsd,
            internetMbps: 100,
            tempNowC: 20,
            humidityNow: 50,
            airQualityNow: 20,
            airQualityYear: 25,
            safety: nil,
            cleanliness: nil,
            fun: nil,
            nightlife: nil,
            walkability: nil,
            healthcare: nil,
            english: nil,
            lgbtFriendly: nil,
            femaleFriendly: nil,
            overall: overall
        )
    }
}

private final class RequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var entries: [(String, String?)] = []

    func record(path: String, day: String?) {
        lock.lock()
        defer { lock.unlock() }
        entries.append((path, day))
    }

    func days(for path: String) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return entries.filter { $0.0 == path }.compactMap(\.1)
    }
}

private final class VerifyURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: (@Sendable (URLRequest) -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        handler != nil && request.url?.host == "api.panperyskop.app"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        deliver(handler(request))
    }

    override func stopLoading() {}

    private func deliver(_ result: (HTTPURLResponse, Data)) {
        client?.urlProtocol(self, didReceive: result.0, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: result.1)
        client?.urlProtocolDidFinishLoading(self)
    }
}
