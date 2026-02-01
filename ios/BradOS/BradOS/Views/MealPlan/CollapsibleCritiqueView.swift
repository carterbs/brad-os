import SwiftUI
import BradOSCore

/// Collapsible freeform critique input, replacing the always-visible CritiqueInputView.
/// The tap/swipe UI is the primary interaction; this is secondary.
struct CollapsibleCritiqueView: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            // Disclosure toggle
            Button(action: {
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.isCritiqueExpanded.toggle()
                }
            }) {
                HStack {
                    Text("Adjust Plan")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    Image(systemName: viewModel.isCritiqueExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                .background(Theme.backgroundSecondary)
                .cornerRadius(Theme.CornerRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                        .stroke(Theme.border.opacity(0.5), lineWidth: 1)
                )
            }
            .buttonStyle(PlainButtonStyle())

            // Expanded content
            if viewModel.isCritiqueExpanded {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    // Conversation history
                    if let session = viewModel.session, !session.history.isEmpty {
                        conversationHistory(session.history)
                    } else if let explanation = viewModel.lastExplanation {
                        assistantBubble(explanation)
                    }

                    // Input row
                    inputRow
                }
                .padding(.horizontal, Theme.Spacing.xs)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
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
                .foregroundColor(Theme.textOnDark)
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
                        .stroke(Theme.border.opacity(0.5), lineWidth: 1)
                )
                .submitLabel(.send)
                .onSubmit {
                    sendCritique()
                }

            Button(action: sendCritique) {
                Group {
                    if viewModel.isSending {
                        ProgressView()
                            .tint(Theme.textOnDark)
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

#Preview("Collapsed") {
    CollapsibleCritiqueView(viewModel: .preview)
        .padding()
        .background(Theme.background)
        .preferredColorScheme(.dark)
}
