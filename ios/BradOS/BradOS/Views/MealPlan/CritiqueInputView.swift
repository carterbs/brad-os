import SwiftUI
import BradOSCore

/// Chat-like input area for critiquing the meal plan
struct CritiqueInputView: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            // Section header
            SectionHeader(title: "Refine Plan")

            // Conversation history
            if let session = viewModel.session, !session.history.isEmpty {
                conversationHistory(session.history)
            } else if let explanation = viewModel.lastExplanation {
                // Show standalone explanation if no history yet
                assistantBubble(explanation)
            }

            // Input row
            inputRow
        }
    }

    // MARK: - Conversation History

    @ViewBuilder
    private func conversationHistory(_ messages: [ConversationMessage]) -> some View {
        VStack(spacing: Theme.Spacing.sm) {
            ForEach(messages) { message in
                switch message.role {
                case .user:
                    userBubble(message.content)
                case .assistant:
                    assistantBubble(message.content)
                }
            }
        }
    }

    // MARK: - Message Bubbles

    @ViewBuilder
    private func userBubble(_ text: String) -> some View {
        HStack {
            Spacer(minLength: 40)
            Text(text)
                .font(.subheadline)
                .foregroundColor(.white)
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                .background(Theme.accent)
                .cornerRadius(Theme.CornerRadius.lg)
        }
    }

    @ViewBuilder
    private func assistantBubble(_ text: String) -> some View {
        HStack {
            Text(text)
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                .background(Theme.backgroundTertiary)
                .cornerRadius(Theme.CornerRadius.lg)
            Spacer(minLength: 40)
        }
    }

    // MARK: - Input Row

    @ViewBuilder
    private var inputRow: some View {
        HStack(spacing: Theme.Spacing.sm) {
            TextField("Ask to swap meals, adjust effort...", text: $viewModel.critiqueText)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.sm)
                .background(Theme.backgroundSecondary)
                .cornerRadius(Theme.CornerRadius.md)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                        .stroke(Theme.border, lineWidth: 1)
                )
                .submitLabel(.send)
                .onSubmit {
                    sendCritique()
                }

            Button(action: sendCritique) {
                Group {
                    if viewModel.isSending {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                }
                .frame(width: 36, height: 36)
            }
            .disabled(viewModel.isSending || viewModel.critiqueText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .foregroundColor(
                viewModel.isSending || viewModel.critiqueText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? Theme.disabled
                    : Theme.accent
            )
        }
    }

    // MARK: - Actions

    private func sendCritique() {
        Task { await viewModel.sendCritique() }
    }
}

#Preview("Critique Input") {
    VStack {
        CritiqueInputView(viewModel: .preview)
    }
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
