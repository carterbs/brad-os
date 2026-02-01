import Foundation

/// ViewModel for the Meal Plan feature
/// Manages plan generation, critique loop, and finalization
@MainActor
public class MealPlanViewModel: ObservableObject {
    // MARK: - Published State

    @Published public var session: MealPlanSession?
    @Published public var currentPlan: [MealPlanEntry] = []
    @Published public var isLoading = false
    @Published public var isSending = false
    @Published public var error: String?
    @Published public var critiqueText = ""
    @Published public var lastExplanation: String?
    @Published public var changedSlots: Set<String> = []

    // MARK: - Constants

    private static let sessionIdKey = "mealPlanSessionId"

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    public init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    // MARK: - Session Persistence

    private var savedSessionId: String? {
        get { UserDefaults.standard.string(forKey: Self.sessionIdKey) }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue, forKey: Self.sessionIdKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.sessionIdKey)
            }
        }
    }

    // MARK: - Generate Plan

    public func generatePlan() async {
        isLoading = true
        error = nil

        do {
            let response = try await apiClient.generateMealPlan()
            savedSessionId = response.sessionId

            let fullSession = try await apiClient.getMealPlanSession(id: response.sessionId)
            session = fullSession
            currentPlan = fullSession.plan
        } catch {
            self.error = "Failed to generate meal plan"
            #if DEBUG
            print("[MealPlanViewModel] Generate error: \(error)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Load Existing Session

    public func loadExistingSession() async {
        guard let sessionId = savedSessionId else { return }

        isLoading = true
        error = nil

        do {
            let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
            if fullSession.isFinalized {
                // Finalized sessions should not be resumed
                savedSessionId = nil
                isLoading = false
                return
            }
            session = fullSession
            currentPlan = fullSession.plan
        } catch {
            // Session not found or expired, clear the saved ID
            savedSessionId = nil
            #if DEBUG
            print("[MealPlanViewModel] Load session error: \(error)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Send Critique

    public func sendCritique() async {
        let text = critiqueText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let sessionId = session?.id else { return }

        isSending = true
        error = nil

        do {
            let response = try await apiClient.critiqueMealPlan(sessionId: sessionId, critique: text)

            // Track changed slots from operations
            var changed = Set<String>()
            for operation in response.operations {
                changed.insert("\(operation.dayIndex)-\(operation.mealType.rawValue)")
            }
            changedSlots = changed

            // Update plan and explanation
            currentPlan = response.plan
            lastExplanation = response.explanation
            critiqueText = ""

            // Refetch full session for updated history
            let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
            session = fullSession

            isSending = false

            // Clear highlight after 2 seconds
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                changedSlots = []
            }
        } catch {
            self.error = "Failed to send critique"
            isSending = false
            #if DEBUG
            print("[MealPlanViewModel] Critique error: \(error)")
            #endif
        }
    }

    // MARK: - Finalize

    public func finalize() async {
        guard let sessionId = session?.id, session?.isFinalized != true else { return }

        error = nil

        do {
            try await apiClient.finalizeMealPlan(sessionId: sessionId)

            // Refetch session to get updated finalized state
            let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
            session = fullSession
            currentPlan = fullSession.plan

            // Clear saved session ID since it's finalized
            savedSessionId = nil
        } catch {
            self.error = "Failed to finalize meal plan"
            #if DEBUG
            print("[MealPlanViewModel] Finalize error: \(error)")
            #endif
        }
    }

    // MARK: - Start New Plan

    public func startNewPlan() {
        session = nil
        currentPlan = []
        lastExplanation = nil
        critiqueText = ""
        changedSlots = []
        error = nil
        savedSessionId = nil
    }
}

// MARK: - Preview Support

public extension MealPlanViewModel {
    static var preview: MealPlanViewModel {
        let viewModel = MealPlanViewModel(apiClient: MockAPIClient())
        viewModel.session = MealPlanSession.mockSession
        viewModel.currentPlan = MealPlanSession.mockSession.plan
        return viewModel
    }

    static var empty: MealPlanViewModel {
        MealPlanViewModel(apiClient: MockAPIClient.empty)
    }
}
