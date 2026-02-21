import SwiftUI
import BradOSCore

/// Generic wrapper that handles the loading/error/content switch for LoadState
struct LoadStateView<T, Content: View>: View {
    let state: LoadState<T>
    let loadingMessage: String
    let retryAction: () async -> Void
    @ViewBuilder let content: (T) -> Content

    init(
        _ state: LoadState<T>,
        loadingMessage: String = "Loading...",
        retryAction: @escaping () async -> Void,
        @ViewBuilder content: @escaping (T) -> Content
    ) {
        self.state = state
        self.loadingMessage = loadingMessage
        self.retryAction = retryAction
        self.content = content
    }

    var body: some View {
        switch state {
        case .idle, .loading:
            LoadingView(message: loadingMessage)

        case .error(let error):
            ErrorStateView(message: error.displayMessage) {
                Task { await retryAction() }
            }

        case .loaded(let data):
            content(data)
        }
    }
}
