import Foundation
import Testing
@testable import Brad_OS
import BradOSCore

@Suite
struct TodayCoachCardStateTests {
    @Test
    func loadingPrecedenceWhenRecoveryLoading() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: true,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: makeTodayCoachRecommendation()
        )

        #expect(state == .loading)
    }

    @Test
    func loadingPrecedenceWhenCoachLoading() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: true,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: makeTodayCoachRecommendation()
        )

        #expect(state == .loading)
    }

    @Test
    func loadingPrecedenceWhenBothLoading() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: true,
            isCoachLoading: true,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: makeTodayCoachRecommendation()
        )

        #expect(state == .loading)
    }

    @Test
    func errorPrecedenceOverNotAuthorized() {
        let errorMessage = "Failed to fetch recommendations"
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: errorMessage,
            isHealthAuthorized: false,
            recovery: nil,
            recommendation: nil
        )

        #expect(state == .error(errorMessage))
    }

    @Test
    func errorPrecedenceOverNoData() {
        let errorMessage = "Network error"
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: errorMessage,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: nil
        )

        #expect(state == .error(errorMessage))
    }

    @Test
    func notAuthorizedStateWhenUnauthorizedAndNoRecovery() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: false,
            recovery: nil,
            recommendation: nil
        )

        #expect(state == .notAuthorized)
    }

    @Test
    func notAuthorizedNotReturnedWhenRecoveryExists() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: false,
            recovery: makeRecoveryData(),
            recommendation: nil
        )

        #expect(state == .noData)
    }

    @Test
    func noDataStateWhenRecoveryNil() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: nil,
            recommendation: nil
        )

        #expect(state == .noData)
    }

    @Test
    func noDataStateWhenRecoveryExistsButNoRecommendation() {
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: nil
        )

        #expect(state == .noData)
    }

    @Test
    func summaryStateWithFullData() {
        let recommendation = makeTodayCoachRecommendation()
        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: recommendation
        )

        #expect(state == .summary(recommendation))
    }

    @Test
    func summaryStateWithPartialSectionsNil() {
        // Create a recommendation with lifting, cycling, and weight sections as nil
        let recommendation = makeTodayCoachRecommendation(
            lifting: nil,
            cycling: nil,
            weight: nil
        )

        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: recommendation
        )

        // Should still return .summary, and the briefing should be accessible
        #expect(state == .summary(recommendation))

        if case .summary(let rec) = state {
            #expect(rec.dailyBriefing != nil)
            #expect(rec.sections.lifting == nil)
            #expect(rec.sections.cycling == nil)
            #expect(rec.sections.weight == nil)
            // Required sections should still exist
            #expect(rec.sections.recovery != nil)
        }
    }

    @Test
    func summaryStatePreservesRecommendationData() {
        let dailyBriefing = "Test briefing content"
        let recommendation = makeTodayCoachRecommendation(dailyBriefing: dailyBriefing)

        let state = TodayCoachCard.resolveDisplayState(
            isLoadingRecovery: false,
            isCoachLoading: false,
            coachError: nil,
            isHealthAuthorized: true,
            recovery: makeRecoveryData(),
            recommendation: recommendation
        )

        if case .summary(let rec) = state {
            #expect(rec.dailyBriefing == dailyBriefing)
        } else {
            Issue.record("Expected .summary state")
        }
    }
}

// makeRecoveryData is defined in AppTestDoubles.swift
