import SwiftUI

struct FTPEntryView: View {
    @State private var ftpValue: String = ""
    @State private var testDate = Date()
    @State private var source: FTPSource = .manual
    @State private var isSaving = false
    @State private var ftpHistory: [FTPEntry] = []

    enum FTPSource: String, CaseIterable {
        case manual = "Manual Entry"
        case test = "FTP Test"
    }

    struct FTPEntry: Identifiable {
        let id: String
        let value: Int
        let date: Date
        let source: FTPSource
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                // Current FTP Section
                currentFTPSection

                // Save Button Section
                saveButtonSection

                // History Section
                historySection
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("FTP")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear { loadHistory() }
    }

    // MARK: - Current FTP Section

    @ViewBuilder
    private var currentFTPSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Current FTP")

            VStack(spacing: 0) {
                // FTP Value Input
                HStack {
                    Text("Watts")
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    TextField("Enter FTP", text: $ftpValue)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .foregroundColor(Theme.textPrimary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

                // Date Picker
                DatePicker(
                    "Last Tested",
                    selection: $testDate,
                    displayedComponents: .date
                )
                .foregroundColor(Theme.textPrimary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

                // Source Picker
                HStack {
                    Text("Source")
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    Picker("Source", selection: $source) {
                        ForEach(FTPSource.allCases, id: \.self) { source in
                            Text(source.rawValue).tag(source)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.interactivePrimary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Save Button Section

    @ViewBuilder
    private var saveButtonSection: some View {
        Button(action: saveFTP) {
            HStack {
                if isSaving {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Save FTP")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(GlassPrimaryButtonStyle())
        .disabled(ftpValue.isEmpty || isSaving)
        .opacity(ftpValue.isEmpty ? 0.5 : 1.0)
    }

    // MARK: - History Section

    @ViewBuilder
    private var historySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "History")

            VStack(spacing: 0) {
                if ftpHistory.isEmpty {
                    HStack {
                        Text("No FTP history yet")
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                    .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                } else {
                    ForEach(Array(ftpHistory.enumerated()), id: \.element.id) { index, entry in
                        if index > 0 {
                            Divider()
                                .background(Theme.strokeSubtle)
                        }

                        HStack {
                            Text("\(entry.value)W")
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(entry.date, style: .date)
                                    .foregroundColor(Theme.textPrimary)
                                Text(entry.source.rawValue)
                                    .font(.caption)
                                    .foregroundStyle(Theme.textSecondary)
                            }
                        }
                        .padding(Theme.Spacing.space4)
                        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                    }
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Actions

    private func saveFTP() {
        guard let watts = Int(ftpValue) else { return }
        isSaving = true
        let sourceValue = source == .test ? "test" : "manual"

        Task {
            do {
                let response = try await APIClient.shared.createFTPEntry(value: watts, date: testDate, source: sourceValue)
                let history = try await APIClient.shared.getFTPHistory()
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                ftpHistory = history.map { entry in
                    FTPEntry(
                        id: entry.id,
                        value: entry.value,
                        date: formatter.date(from: entry.date) ?? Date(),
                        source: entry.source == "test" ? .test : .manual
                    )
                }
                ftpValue = ""
            } catch {
                print("[FTPEntryView] Failed to save FTP: \(error)")
            }
            isSaving = false
        }
    }

    private func loadHistory() {
        Task {
            do {
                let history = try await APIClient.shared.getFTPHistory()
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                ftpHistory = history.map { entry in
                    FTPEntry(
                        id: entry.id,
                        value: entry.value,
                        date: formatter.date(from: entry.date) ?? Date(),
                        source: entry.source == "test" ? .test : .manual
                    )
                }
            } catch {
                print("[FTPEntryView] Failed to load FTP history: \(error)")
            }
        }
    }
}

#Preview {
    NavigationStack {
        FTPEntryView()
    }
    .preferredColorScheme(.dark)
}
