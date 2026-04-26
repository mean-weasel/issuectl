import SwiftUI

struct QuickCreateSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let repos: [Repo]
    let onSuccess: () -> Void

    @State private var title = ""
    @State private var bodyText = ""
    @State private var selectedRepoId: Int?
    @State private var priority: String = "normal"
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    // Labels
    @State private var availableLabels: [GitHubLabel] = []
    @State private var selectedLabels: Set<String> = []
    @State private var isLoadingLabels = false

    private var selectedRepo: Repo? {
        repos.first { $0.id == selectedRepoId }
    }

    private var buttonLabel: String {
        if let repo = selectedRepo {
            return "Create Issue in \(repo.name)"
        }
        return "Create Draft"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Issue title", text: $title)
                        .font(.body)
                }

                Section("Description") {
                    TextEditor(text: $bodyText)
                        .font(.body)
                        .frame(minHeight: 100)
                        .overlay(alignment: .topLeading) {
                            if bodyText.isEmpty {
                                Text("Optional description...")
                                    .foregroundStyle(.tertiary)
                                    .font(.body)
                                    .padding(.top, 8)
                                    .padding(.leading, 5)
                                    .allowsHitTesting(false)
                            }
                        }
                }

                Section("Repository") {
                    Picker("Repo", selection: $selectedRepoId) {
                        Text("None (local draft)").tag(nil as Int?)
                        ForEach(Array(repos.enumerated()), id: \.element.id) { index, repo in
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(RepoColors.color(for: index))
                                    .frame(width: 8, height: 8)
                                Text(repo.fullName)
                            }
                            .tag(repo.id as Int?)
                        }
                    }
                }

                if selectedRepo != nil {
                    Section("Labels") {
                        LabelPicker(
                            labels: availableLabels,
                            selectedLabels: $selectedLabels,
                            isLoading: isLoadingLabels
                        )
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        Text("Low").tag("low")
                        Text("Normal").tag("normal")
                        Text("High").tag("high")
                    }
                    .pickerStyle(.segmented)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text(buttonLabel)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .navigationTitle("Quick Create")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: selectedRepoId) { _, newValue in
                selectedLabels = []
                availableLabels = []
                if let repoId = newValue, let repo = repos.first(where: { $0.id == repoId }) {
                    Task { await loadLabels(owner: repo.owner, repo: repo.name) }
                }
            }
        }
    }

    private func loadLabels(owner: String, repo: String) async {
        isLoadingLabels = true
        do {
            availableLabels = try await api.repoLabels(owner: owner, repo: repo)
        } catch {
            // Label loading is non-critical — the user can still create without labels
            availableLabels = []
        }
        isLoadingLabels = false
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let createBody = CreateDraftRequestBody(
                title: trimmedTitle,
                body: trimmedBody.isEmpty ? nil : trimmedBody,
                priority: priority
            )
            let createResponse = try await api.createDraft(body: createBody)

            guard createResponse.success, let draftId = createResponse.id else {
                errorMessage = createResponse.error ?? "Failed to create draft"
                isSubmitting = false
                return
            }

            // If a repo is selected, assign the draft to create a GitHub issue
            if let repoId = selectedRepoId {
                let labels = selectedLabels.isEmpty ? nil : Array(selectedLabels)
                let assignBody = AssignDraftWithLabelsRequestBody(repoId: repoId, labels: labels)
                let assignResponse = try await api.assignDraftWithLabels(id: draftId, body: assignBody)
                if !assignResponse.success {
                    errorMessage = assignResponse.error ?? "Draft created but failed to assign to repo"
                    isSubmitting = false
                    return
                }
                if let warning = assignResponse.cleanupWarning {
                    // Issue was created on GitHub but draft cleanup failed on server.
                    // Show warning and refresh, but don't auto-dismiss so user sees it.
                    errorMessage = "Issue created. Note: \(warning)"
                    isSubmitting = false
                    onSuccess()
                    return
                }
            }

            onSuccess()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
