import XCTest
@testable import PanPeryskop

final class HTTPClientTests: XCTestCase {
    private func makeClient() -> HTTPClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return HTTPClient(baseURL: "https://test.local", session: URLSession(configuration: config))
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    func testGetDecodesJSON() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/travel/flights/ryanair")
            let body = #"{"outbound":[{"date":"2026-09-09","hour":"10:00","price":120}],"returning":[]}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, body)
        }
        struct Window: Decodable { struct Cell: Decodable { let date: String; let price: Double? }; let outbound: [Cell] }
        let window: Window = try await makeClient().get("/travel/flights/ryanair")
        XCTAssertEqual(window.outbound.first?.date, "2026-09-09")
        XCTAssertEqual(window.outbound.first?.price, 120)
    }

    func testServerErrorThrowsTypedAPIError() async {
        StubURLProtocol.handler = { request in
            let body = #"{"error":"boom"}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, body)
        }
        do {
            let _: [String: String] = try await makeClient().get("/nope")
            XCTFail("expected throw")
        } catch let APIError.server(statusCode, message) {
            XCTAssertEqual(statusCode, 500)
            XCTAssertEqual(message, "boom")
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }
}

final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        let (response, data) = handler(request)
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}