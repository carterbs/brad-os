import Testing
@testable import Brad_OS
import BradOSCore
import Foundation

@Suite("TodayCoachClient")
struct TodayCoachClientTests {
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

    /// Helper to create a valid fallback response JSON
    private func makeFallbackResponseJSON() -> [String: Any] {
        return [
            "dailyBriefing": "Recovery score is 75/100 (ready). No lifting workout scheduled today.",
            "sections": [
                "recovery": [
                    "insight": "Recovery score: 75/100. Green light for training.",
                    "status": "good"
                ],
                "lifting": NSNull(),
                "cycling": NSNull(),
                "stretching": [
                    "insight": "Stretching is on track.",
                    "suggestedRegions": ["back", "hips", "shoulders"],
                    "priority": "normal"
                ],
                "meditation": [
                    "insight": "A short meditation session could support your recovery.",
                    "suggestedDurationMinutes": 10,
                    "priority": "normal"
                ],
                "weight": NSNull()
            ] as [String: Any],
            "warnings": [
                [
                    "type": "fallback",
                    "message": "This is a default recommendation. Try again later for personalized coaching."
                ]
            ]
        ]
    }

    /// Helper to create a fallback response with a specific warning type
    private func makeFallbackResponseJSONWithWarning(type: String) -> [String: Any] {
        var response = makeFallbackResponseJSON()
        response["warnings"] = [
            [
                "type": type,
                "message": "This is a fallback recommendation."
            ]
        ]
        return response
    }

    /// Helper to create recovery data for requests
    private func makeRecoveryData() -> RecoveryData {
        RecoveryData(
            date: Date(),
            hrvMs: 55,
            hrvVsBaseline: 5,
            rhrBpm: 58,
            rhrVsBaseline: -2,
            sleepHours: 7.5,
            sleepEfficiency: 92,
            deepSleepPercent: 22,
            score: 75,
            state: .ready
        )
    }

    /// Helper to encode response as JSON data
    private func encodeResponse(_ response: [String: Any]) -> Data {
        guard let data = try? JSONSerialization.data(withJSONObject: response) else {
            fatalError("Failed to encode test response")
        }
        return data
    }

    // MARK: - Tests

    @Test("fallback payload loads recommendation and keeps error nil")
    @MainActor
    func fallbackPayloadLoadsRecommendation() async {
        let fallbackResponse = makeFallbackResponseJSON()
        let apiClient = makeTestAPIClient { _ in
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, self.encodeResponse(fallbackResponse))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        await client.getRecommendation(recovery: recovery)

        #expect(client.recommendation != nil)
        #expect(client.error == nil)
        #expect(client.recommendation?.sections.recovery.status == "good")
    }

    @Test("invalid fallback variant with timeout warning preserves warning and no error")
    @MainActor
    func timeoutFallbackVariantPreservesWarning() async {
        let timeoutFallback = makeFallbackResponseJSONWithWarning(type: "timeout")
        let apiClient = makeTestAPIClient { _ in
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, self.encodeResponse(timeoutFallback))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        await client.getRecommendation(recovery: recovery)

        #expect(client.recommendation != nil)
        #expect(client.error == nil)
        #expect(client.recommendation?.warnings.first?.type == "timeout")
    }

    @Test("invalid fallback variant with partial warning preserves warning and no error")
    @MainActor
    func partialFallbackVariantPreservesWarning() async {
        let partialFallback = makeFallbackResponseJSONWithWarning(type: "partial")
        let apiClient = makeTestAPIClient { _ in
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, self.encodeResponse(partialFallback))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        await client.getRecommendation(recovery: recovery)

        #expect(client.recommendation != nil)
        #expect(client.error == nil)
        #expect(client.recommendation?.warnings.first?.type == "partial")
    }

    @Test("invalid fallback variant with invalid warning preserves warning and no error")
    @MainActor
    func invalidFallbackVariantPreservesWarning() async {
        let invalidFallback = makeFallbackResponseJSONWithWarning(type: "invalid")
        let apiClient = makeTestAPIClient { _ in
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, self.encodeResponse(invalidFallback))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        await client.getRecommendation(recovery: recovery)

        #expect(client.recommendation != nil)
        #expect(client.error == nil)
        #expect(client.recommendation?.warnings.first?.type == "invalid")
    }

    @Test("partial malformed backend envelope triggers decode error and leaves recommendation unset")
    @MainActor
    func malformedEnvelopeTriggersError() async {
        let apiClient = makeTestAPIClient { _ in
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            // Return an object that's missing critical required fields
            let malformed: [String: Any] = [
                "dailyBriefing": "Test",
                "sections": [
                    "recovery": [
                        "insight": "Test",
                        "status": "good"
                    ],
                    // Missing stretching and meditation which are required
                ],
                "warnings": []
            ]
            return (response, self.encodeResponse(malformed))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        await client.getRecommendation(recovery: recovery)

        #expect(client.recommendation == nil)
        #expect(client.error != nil)
    }

    @Test("network error surfaces error state and leaves recommendation unset")
    @MainActor
    func networkErrorSurfacesError() async {
        let apiClient = makeTestAPIClient { _ in
            throw NSError(domain: NSURLErrorDomain, code: NSURLErrorNetworkConnectionLost)
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        await client.getRecommendation(recovery: recovery)

        #expect(client.recommendation == nil)
        #expect(client.error != nil)
    }

    @Test("isLoading state is properly managed during request")
    @MainActor
    func loadingStateIsManaged() async {
        let fallbackResponse = makeFallbackResponseJSON()
        let apiClient = makeTestAPIClient { _ in
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, self.encodeResponse(fallbackResponse))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        #expect(client.isLoading == false)

        let task = Task {
            await client.getRecommendation(recovery: recovery)
        }

        await task.value

        #expect(client.isLoading == false)
        #expect(client.recommendation != nil)
    }

    @Test("cached recommendation is returned without new API call")
    @MainActor
    func cachedRecommendationIsReturned() async {
        var callCount = 0
        let fallbackResponse = makeFallbackResponseJSON()
        let apiClient = makeTestAPIClient { _ in
            callCount += 1
            let response = HTTPURLResponse(url: URL(string: "http://test.local/today-coach/recommend")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, self.encodeResponse(fallbackResponse))
        }

        let client = TodayCoachClient(apiClient: apiClient)
        let recovery = makeRecoveryData()

        // First call
        await client.getRecommendation(recovery: recovery)
        #expect(callCount == 1)
        #expect(client.recommendation != nil)

        // Second call should return cached
        await client.getRecommendation(recovery: recovery)
        #expect(callCount == 1) // No additional call
    }
}
