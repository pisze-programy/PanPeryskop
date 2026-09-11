import Foundation

// MARK: - Media requests

extension APIClient {
    static func getMediaRequests(swLat: Double, swLng: Double, neLat: Double, neLng: Double) async throws -> MediaRequestListResponse {
        let params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
        ]
        return try await get("/media-requests", params: params)
    }

    static func createMediaRequest(lat: Double, lng: Double) async throws -> MediaRequest {
        let (data, response) = try await http.postRawData("/media-requests", json: ["lat": lat, "lng": lng])
        if let http = response as? HTTPURLResponse, http.statusCode == 429 {
            let cooldown = try? JSONDecoder().decode(MediaRequestCooldown.self, from: data)
            throw APIError.cooldown(retryAfterMin: cooldown?.retry_after_min)
        }
        try http.validate(response: response, data: data)
        return try JSONDecoder().decode(CreateMediaRequestResponse.self, from: data).request
    }
}