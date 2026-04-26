import SwiftUI

struct LabelManagementSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let currentLabels: [GitHubLabel]
    let onSuccess: () -> Void

    @State private var repoLabels: [GitHubLabel] = []
    @State private var activeLabels: Set<String>
    @State private var isLoading = true
    @State private var isToggling: String?
    @State private var errorMessage: String?
    @State private var searchText = ""

    init(
        owner: String, repo: String, number: Int,
        currentLabels: [GitHubLabel],
        onSuccess: @escaping () -> Void
    ) {
        self.owner = owner
        self.repo = repo
        self.number = number
        self.currentLabels = currentLabels
        self.onSuccess = onSuccess
        _activeLabels = State(initialValue: Set(currentLabels.map(\.name)))
    }

    private var filteredLabels: [GitHubLabel] {
        if searchText.isEmpty {
            return repoLabels
        }
        return repoLabels.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading labels...")
                } else if repoLabels.isEmpty {
                    ContentUnavailableView {
                        Label("No Labels", systemImage: "tag")
                    } description: {
                        Text("This repository has no labels defined.")
                    }
                } else {
                    List {
                        ForEach(filteredLabels) { label in
                            labelRow(label)
                        }
                    }
                    .searchable(text: $searchText, prompt: "Filter labels")
                }
            }
            .navigationTitle("Labels")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .task { await loadLabels() }
        }
    }

    @ViewBuilder
    private func labelRow(_ label: GitHubLabel) -> some View {
        let isActive = activeLabels.contains(label.name)
        let isCurrentlyToggling = isToggling == label.name

        Button {
            Task { await toggle(label: label, isActive: isActive) }
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(hex: label.color) ?? .secondary)
                    .frame(width: 14, height: 14)

                VStack(alignment: .leading, spacing: 2) {
                    Text(label.name)
                        .font(.body)
                        .foregroundStyle(.primary)

                    if let description = label.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer()

                if isCurrentlyToggling {
                    ProgressView().controlSize(.small)
                } else if isActive {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.blue)
                        .fontWeight(.semibold)
                }
            }
        }
        .disabled(isCurrentlyToggling)
    }

    private func loadLabels() async {
        isLoading = true
        do {
            let response = try await api.listRepoLabels(owner: owner, repo: repo)
            repoLabels = response.labels.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func toggle(label: GitHubLabel, isActive: Bool) async {
        isToggling = label.name
        errorMessage = nil
        do {
            let requestBody = ToggleLabelRequestBody(
                label: label.name,
                action: isActive ? "remove" : "add"
            )
            let response = try await api.toggleLabel(
                owner: owner, repo: repo, number: number,
                body: requestBody
            )
            if response.success {
                if isActive {
                    activeLabels.remove(label.name)
                } else {
                    activeLabels.insert(label.name)
                }
                onSuccess()
            } else {
                errorMessage = response.error ?? "Failed to toggle label"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isToggling = nil
    }
}

