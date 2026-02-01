import SwiftUI
import BradOSCore

/// Chat-like input area for critiquing the meal plan
struct CritiqueInputView: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
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
        VStack(spacing: Theme.Spacing.space2) {
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
                .foregroundColor(Theme.textOnAccent)
                .padding(.horizontal, Theme.Spacing.space4)
                .padding(.vertical, Theme.Spacing.space2)
                .background(Theme.interactivePrimary)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous))
        }
    }

    @ViewBuilder
    private func assistantBubble(_ text: String) -> some View {
        HStack {
            Text(text)
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, Theme.Spacing.space4)
                .padding(.vertical, Theme.Spacing.space2)
                .background(Theme.BG.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous))
            Spacer(minLength: 40)
        }
    }

    // MARK: - Input Row

    @ViewBuilder
    private var inputRow: some View {
        HStack(spacing: Theme.Spacing.space2) {
            TextField("Ask to swap meals, adjust effort...", text: $viewModel.critiqueText)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.space2)
                .frame(height: Theme.Dimensions.inputHeight)
                .background(.ultraThinMaterial)
                .background(Theme.BG.surface.opacity(GlassLevel.card.fillOpacity))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                        .stroke(Theme.strokeSubtle, lineWidth: 1)
                )
                .submitLabel(.send)
                .onSubmit {
                    sendCritique()
                }

            Button(action: sendCritique) {
                Group {
                    if viewModel.isSending {
                        ProgressView()
                            .tint(Theme.textOnAccent)
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
                    ? Theme.textDisabled
                    : Theme.interactivePrimary
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
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
