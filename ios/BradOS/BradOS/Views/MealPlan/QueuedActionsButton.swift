import SwiftUI
import BradOSCore

/// Floating button that appears when queued actions exist, showing counts and allowing batch submit
struct QueuedActionsButton: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        if !viewModel.queuedActions.isEmpty {
            Button(action: {
                Task { await viewModel.submitQueuedActions() }
            }) {
                HStack(spacing: Theme.Spacing.sm) {
                    if viewModel.isSending {
                        ProgressView()
                            .tint(Theme.textOnDark)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.subheadline)
                    }
                    Text(buttonLabel)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                .foregroundColor(Theme.textOnDark)
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.vertical, Theme.Spacing.sm + 2)
                .background(Theme.mealPlan)
                .cornerRadius(Theme.CornerRadius.xl)
                .shadow(color: Theme.mealPlan.opacity(0.4), radius: 8, y: 4)
            }
            .disabled(viewModel.isSending)
            .transition(.scale.combined(with: .opacity))
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: viewModel.queuedActions.isEmpty)
        }
    }

    private var buttonLabel: String {
        let swaps = viewModel.queuedActions.swapCount
        let removes = viewModel.queuedActions.removeCount
        var parts: [String] = []
        if swaps > 0 {
            parts.append("\(swaps) swap\(swaps == 1 ? "" : "s")")
        }
        if removes > 0 {
            parts.append("\(removes) remove\(removes == 1 ? "" : "s")")
        }
        return "Send \(parts.joined(separator: ", "))"
    }
}

#Preview("With Actions") {
    let vm = MealPlanViewModel.preview
    // Note: Can't easily set queuedActions in preview since it's a struct,
    // but the button won't show without actions queued
    QueuedActionsButton(viewModel: vm)
        .padding()
        .background(Theme.background)
        .preferredColorScheme(.dark)
}
