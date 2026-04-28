import SwiftUI

struct DraftDetailView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let draft: Draft
    let onSaved: () -> Void

    @State private var title: String
    @State private var bodyText: String
    @State private var priority: Priority
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var hasChanges = false
    @State private var showDiscardConfirm = false

    @State private var repos: [Repo] = []
    @State private var selectedRepoId: Int?
    @State private var availableLabels: [GitHubLabel] = []
    @State private var selectedLabels: Set<String> = []
    @State private var isAssigning = false
    @State private var isLoadingLabels = false
    @State private var reposError: String?
    @State private var labelLoadError: String?

    init(draft: Draft, onSaved: @escaping () -> Void) {
        self.draft = draft
        self.onSaved = onSaved
        _title = State(initialValue: draft.title)
        _bodyText = State(initialValue: draft.body ?? "")
        _priority = State(initialValue: draft.priority ?? .normal)
    }

    private var canSave: Bool {
        hasChanges
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isSaving
    }

    var body: some View {
        Form {
            Section("Title") {
                TextField("Issue title", text: $title)
                    .font(.body)
                    .accessibilityIdentifier("draft-title-field")
            }

            Section("Description") {
                TextEditor(text: $bodyText)
                    .font(.body)
                    .frame(minHeight: 120)
                    .accessibilityIdentifier("draft-body-editor")
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

            Section("Priority") {
                Picker("Priority", selection: $priority) {
                    Text("Low").tag(Priority.low)
                    Text("Normal").tag(Priority.normal)
                    Text("High").tag(Priority.high)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("priority-picker")
            }

            Section("Assign to Repository") {
                if let reposError {
                    Label(reposError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                    Button("Retry") { Task { await loadRepos() } }
                        .font(.subheadline)
                }

                Picker("Repository", selection: $selectedRepoId) {
                    Text("None (keep as draft)").tag(nil as Int?)
                    ForEach(repos) { repo in
                        Text(repo.fullName).tag(repo.id as Int?)
                    }
                }
                .accessibilityIdentifier("assign-repo-picker")

                if let labelLoadError {
                    Label(labelLoadError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                    Button("Retry") {
                        if let repoId = selectedRepoId, let repo = repos.first(where: { $0.id == repoId }) {
                            Task { await loadLabels(owner: repo.owner, name: repo.name) }
                        }
                    }
                    .font(.subheadline)
                } else if isLoadingLabels {
                    HStack {
                        ProgressView()
                            .controlSize(.small)
                        Text("Loading labels...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else if !availableLabels.isEmpty {
                    ForEach(availableLabels) { label in
                        Toggle(isOn: Binding(
                            get: { selectedLabels.contains(label.name) },
                            set: { isOn in
                                if isOn { selectedLabels.insert(label.name) }
                                else { selectedLabels.remove(label.name) }
                            }
                        )) {
                            LabelBadge(label: label)
                        }
                    }
                }

                if selectedRepoId != nil {
                    Button {
                        Task { await assignToRepo() }
                    } label: {
                        if isAssigning {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            let repoName = repos.first(where: { $0.id == selectedRepoId })?.name ?? "Repo"
                            Label("Create Issue in \(repoName)", systemImage: "arrow.up.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isAssigning)
                    .accessibilityIdentifier("assign-draft-button")
                }
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Edit Draft")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    if hasChanges {
                        showDiscardConfirm = true
                    } else {
                        dismiss()
                    }
                } label: {
                    Text("Back")
                }
                .accessibilityIdentifier("draft-back-button")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!canSave)
                .accessibilityIdentifier("save-draft-button")
            }
        }
        .task { await loadRepos() }
        .onChange(of: title) { _, _ in updateHasChanges() }
        .onChange(of: bodyText) { _, _ in updateHasChanges() }
        .onChange(of: priority) { _, _ in updateHasChanges() }
        .onChange(of: selectedRepoId) { _, newValue in
            if let repoId = newValue, let repo = repos.first(where: { $0.id == repoId }) {
                Task { await loadLabels(owner: repo.owner, name: repo.name) }
            } else {
                availableLabels = []
                selectedLabels = []
            }
        }
        .onDisappear {
            if hasChanges {
                Task { await autoSave() }
            }
        }
        .confirmationDialog(
            "You have unsaved changes",
            isPresented: $showDiscardConfirm,
            titleVisibility: .visible
        ) {
            Button("Save and Close") {
                Task {
                    let saved = await autoSave()
                    if saved { dismiss() }
                }
            }
            Button("Discard Changes", role: .destructive) {
                hasChanges = false
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func updateHasChanges() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        let titleChanged = trimmedTitle != draft.title
        let bodyChanged = trimmedBody != (draft.body ?? "")
        let priorityChanged = priority != (draft.priority ?? .normal)
        hasChanges = titleChanged || bodyChanged || priorityChanged
    }

    private func loadRepos() async {
        reposError = nil
        do {
            repos = try await api.repos()
        } catch {
            reposError = "Failed to load repositories"
        }
    }

    private func loadLabels(owner: String, name: String) async {
        isLoadingLabels = true
        selectedLabels = []
        labelLoadError = nil
        defer { isLoadingLabels = false }
        do {
            let labels = try await api.repoLabels(owner: owner, repo: name)
            guard repos.first(where: { $0.owner == owner && $0.name == name })?.id == selectedRepoId else { return }
            availableLabels = labels
        } catch {
            availableLabels = []
            labelLoadError = "Failed to load labels"
        }
    }

    private func assignToRepo() async {
        guard let repoId = selectedRepoId else { return }
        isAssigning = true
        errorMessage = nil
        do {
            let body = AssignDraftWithLabelsRequestBody(
                repoId: repoId,
                labels: selectedLabels.isEmpty ? nil : Array(selectedLabels)
            )
            let response = try await api.assignDraftWithLabels(id: draft.id, body: body)
            if response.success {
                onSaved()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to assign draft"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isAssigning = false
    }

    /// Builds an update body containing only the fields that differ from the original draft.
    private func buildUpdateBody() -> UpdateDraftRequestBody {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        return UpdateDraftRequestBody(
            title: trimmedTitle != draft.title ? trimmedTitle : nil,
            body: trimmedBody != (draft.body ?? "") ? trimmedBody : nil,
            priority: priority != (draft.priority ?? .normal) ? priority : nil
        )
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        do {
            let response = try await api.updateDraft(id: draft.id, body: buildUpdateBody())
            if response.success {
                onSaved()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to save draft"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    @discardableResult
    private func autoSave() async -> Bool {
        guard hasChanges else { return true }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return false }

        do {
            let response = try await api.updateDraft(id: draft.id, body: buildUpdateBody())
            if response.success {
                hasChanges = false
                onSaved()
                return true
            } else {
                print("[IssueCTL] autoSave server error for draft \(draft.id): \(response.error ?? "unknown")")
                errorMessage = response.error ?? "Auto-save failed"
                return false
            }
        } catch {
            print("[IssueCTL] autoSave failed for draft \(draft.id): \(error.localizedDescription)")
            errorMessage = "Auto-save failed: \(error.localizedDescription)"
            return false
        }
    }
}
