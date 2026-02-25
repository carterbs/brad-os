import Foundation
import Testing
@testable import Brad_OS
import BradOSCore

@Suite
struct APIClientCalendarTests {
    /// Helper to create a URLSession with MockURLProtocol for testing
    private func makeTestAPIClient(
        handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]

        MockURLProtocol.requestHandler = handler

        let session = URLSession(configuration: config)
        return APIClient(configuration: .init(baseURL: "http://test.local"), session: session)
    }

    /// Helper to create a calendar day data response
    private func makeCalendarDayData() -> [String: Any] {
        return [
            "date": "2026-01-15",
            "activities": [],
            "summary": [
                "totalActivities": 1,
                "completedActivities": 1,
                "hasWorkout": true,
                "hasStretch": false,
                "hasMeditation": false,
                "hasCycling": false
            ]
        ]
    }

    /// Helper to create calendar data response
    private func makeCalendarDataResponse(startDate: String, endDate: String, days: [String: Any] = [:]) -> [String: Any] {
        return [
            "startDate": startDate,
            "endDate": endDate,
            "days": days
        ]
    }

    /// Helper to encode response as JSON data
    private func encodeResponse(_ response: [String: Any]) -> Data {
        guard let data = try? JSONSerialization.data(withJSONObject: response) else {
            fatalError("Failed to encode test response")
        }
        return data
    }

    // MARK: - Query Parameter Tests

    @Test
    func getCalendarDataIncludesTzQueryParameterWhenProvided() async throws {
        var capturedRequest: URLRequest?

        let client = makeTestAPIClient { request in
            capturedRequest = request
            let response = makeCalendarDataResponse(startDate: "2026-01-01", endDate: "2026-01-31")
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        _ = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: 300)

        #expect(capturedRequest != nil)
        let urlComponents = URLComponents(url: capturedRequest!.url!, resolvingAgainstBaseURL: false)
        let tzQuery = urlComponents?.queryItems?.first(where: { $0.name == "tz" })
        #expect(tzQuery?.value == "300")
    }

    @Test
    func getCalendarDataExcludesTzQueryParameterWhenNil() async throws {
        var capturedRequest: URLRequest?

        let client = makeTestAPIClient { request in
            capturedRequest = request
            let response = makeCalendarDataResponse(startDate: "2026-01-01", endDate: "2026-01-31")
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        _ = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: nil)

        #expect(capturedRequest != nil)
        let urlComponents = URLComponents(url: capturedRequest!.url!, resolvingAgainstBaseURL: false)
        let tzQuery = urlComponents?.queryItems?.first(where: { $0.name == "tz" })
        #expect(tzQuery == nil)
    }

    @Test
    func getCalendarDataIncludesBoundaryTimezoneNegative720() async throws {
        var capturedRequest: URLRequest?

        let client = makeTestAPIClient { request in
            capturedRequest = request
            let response = makeCalendarDataResponse(startDate: "2026-01-01", endDate: "2026-01-31")
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        _ = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: -720)

        #expect(capturedRequest != nil)
        let urlComponents = URLComponents(url: capturedRequest!.url!, resolvingAgainstBaseURL: false)
        let tzQuery = urlComponents?.queryItems?.first(where: { $0.name == "tz" })
        #expect(tzQuery?.value == "-720")
    }

    @Test
    func getCalendarDataIncludesBoundaryTimezonePositive840() async throws {
        var capturedRequest: URLRequest?

        let client = makeTestAPIClient { request in
            capturedRequest = request
            let response = makeCalendarDataResponse(startDate: "2026-02-01", endDate: "2026-02-28")
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        _ = try await client.getCalendarData(year: 2026, month: 2, timezoneOffset: 840)

        #expect(capturedRequest != nil)
        let urlComponents = URLComponents(url: capturedRequest!.url!, resolvingAgainstBaseURL: false)
        let tzQuery = urlComponents?.queryItems?.first(where: { $0.name == "tz" })
        #expect(tzQuery?.value == "840")
    }

    // MARK: - URL Path Tests

    @Test
    func getCalendarDataUsesCorrectUrlPath() async throws {
        var capturedRequest: URLRequest?

        let client = makeTestAPIClient { request in
            capturedRequest = request
            let response = makeCalendarDataResponse(startDate: "2026-01-01", endDate: "2026-01-31")
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        _ = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: nil)

        #expect(capturedRequest != nil)
        let urlString = capturedRequest?.url?.path ?? ""
        #expect(urlString.contains("/calendar/2026/1"))
    }

    // MARK: - Date Decoding Tests

    @Test
    func getCalendarDataDecodesDateFieldsCorrectly() async throws {
        let client = makeTestAPIClient { request in
            let dayData = self.makeCalendarDayData()
            let response = self.makeCalendarDataResponse(
                startDate: "2026-01-01",
                endDate: "2026-01-31",
                days: ["2026-01-15": dayData]
            )
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        let result = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: nil)

        #expect(result.startDate == "2026-01-01")
        #expect(result.endDate == "2026-01-31")
        #expect(result.days["2026-01-15"] != nil)
    }

    @Test
    func getCalendarDataDecodesMonthBoundaryDatesCorrectly() async throws {
        let client = makeTestAPIClient { request in
            var days: [String: Any] = [:]
            days["2026-01-31"] = self.makeCalendarDayData()
            days["2026-02-01"] = self.makeCalendarDayData()

            let response = self.makeCalendarDataResponse(
                startDate: "2026-01-01",
                endDate: "2026-01-31",
                days: days
            )
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        let result = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: nil)

        // Both dates should decode correctly
        #expect(result.days["2026-01-31"] != nil)
        #expect(result.days["2026-02-01"] != nil)
    }

    @Test
    func getCalendarDataDecodesYearBoundaryDatesCorrectly() async throws {
        let client = makeTestAPIClient { request in
            var days: [String: Any] = [:]
            days["2025-12-31"] = self.makeCalendarDayData()
            days["2026-01-01"] = self.makeCalendarDayData()

            let response = self.makeCalendarDataResponse(
                startDate: "2026-01-01",
                endDate: "2026-01-31",
                days: days
            )
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        let result = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: nil)

        // Both dates across year boundary should decode correctly
        #expect(result.days["2025-12-31"] != nil)
        #expect(result.days["2026-01-01"] != nil)
    }

    @Test
    func getCalendarDataHandlesEmptyDaysResponse() async throws {
        let client = makeTestAPIClient { request in
            let response = self.makeCalendarDataResponse(
                startDate: "2026-01-01",
                endDate: "2026-01-31",
                days: [:]
            )
            let data = self.encodeResponse(response)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (httpResponse, data)
        }

        let result = try await client.getCalendarData(year: 2026, month: 1, timezoneOffset: nil)

        #expect(result.startDate == "2026-01-01")
        #expect(result.endDate == "2026-01-31")
        #expect(result.days.isEmpty)
    }
}
