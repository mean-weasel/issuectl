import SwiftUI

struct QuickCreateSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let repos: [Repo]
    /// Called on success. The optional string carries a non-fatal warning
    /// (e.g. "labels could not be applied") that the parent should surface briefly.
    let onSuccess: (_ warning: String?) -> Void

    @State private var title = ""
    @State private var bodyText = ""
    @State private var selectedRepoId: Int?
    @State private var priority: Priority = .normal
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var showMoreOptions = false

    // Labels
    @State private var availableLabels: [GitHubLabel] = []
    @State private var selectedLabels: Set<String> = []
    @State private var isLoadingLabels = false
    @State private var labelLoadError: String?

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
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Create Issue")
                            .font(.title2.weight(.bold))
                        Text("Fast capture first. Add metadata only when needed.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)

                    sheetCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Repository")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            repoSelector
                        }
                    }

                    sheetCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Title")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            TextField("Issue title", text: $title)
                                .font(.body)
                                .textInputAutocapitalization(.sentences)
                                .accessibilityIdentifier("issue-title-field")
                        }
                    }

                    sheetCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Details")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            TextEditor(text: $bodyText)
                                .font(.body)
                                .frame(minHeight: 92)
                                .accessibilityIdentifier("issue-body-editor")
                                .overlay(alignment: .topLeading) {
                                    if bodyText.isEmpty {
                                        Text("Describe the issue")
                                            .foregroundStyle(.tertiary)
                                            .font(.body)
                                            .padding(.top, 8)
                                            .padding(.leading, 5)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }
                    }

                    sheetCard {
                        DisclosureGroup(isExpanded: $showMoreOptions) {
                            VStack(alignment: .leading, spacing: 16) {
                                if let repo = selectedRepo {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text("Labels")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                        if let labelError = labelLoadError {
                                            VStack(alignment: .leading, spacing: 8) {
                                                Label(labelError, systemImage: "exclamationmark.triangle")
                                                    .foregroundStyle(.orange)
                                                    .font(.callout)
                                                Button("Retry") {
                                                    Task { await loadLabels(owner: repo.owner, repo: repo.name) }
                                                }
                                                .font(.callout)
                                            }
                                        } else {
                                            LabelPicker(
                                                labels: availableLabels,
                                                selectedLabels: $selectedLabels,
                                                isLoading: isLoadingLabels
                                            )
                                        }
                                    }

                                    ImageAttachmentButton(owner: repo.owner, repo: repo.name) { markdown in
                                        if bodyText.isEmpty {
                                            bodyText = markdown
                                        } else {
                                            bodyText += "\n\n\(markdown)"
                                        }
                                    }
                                }

                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Priority")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    Picker("Priority", selection: $priority) {
                                        Text("Low").tag(Priority.low)
                                        Text("Normal").tag(Priority.normal)
                                        Text("High").tag(Priority.high)
                                    }
                                    .pickerStyle(.segmented)
                                    .accessibilityIdentifier("priority-picker")
                                }
                            }
                            .padding(.top, 12)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("More Options")
                                    .font(.subheadline.weight(.semibold))
                                Text("Labels, attachments, priority, and local drafts.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityIdentifier("quick-create-more-options")
                    }

                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .font(.subheadline)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 18)
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(buttonLabel)
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(IssueCTLColors.action)
                .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                .accessibilityIdentifier("submit-issue-button")
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .background(.bar)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("cancel-button")
                }
            }
            .onAppear {
                if selectedRepoId == nil {
                    selectedRepoId = repos.first?.id
                }
            }
            .onChange(of: selectedRepoId) { _, newValue in
                selectedLabels = []
                availableLabels = []
                labelLoadError = nil
                if showMoreOptions, let repoId = newValue, let repo = repos.first(where: { $0.id == repoId }) {
                    Task { await loadLabels(owner: repo.owner, repo: repo.name) }
                }
            }
            .onChange(of: showMoreOptions) { _, isExpanded in
                guard isExpanded, availableLabels.isEmpty, labelLoadError == nil, let repo = selectedRepo else { return }
                Task { await loadLabels(owner: repo.owner, repo: repo.name) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private var repoSelector: some View {
        if repos.isEmpty {
            Text("Local draft")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        } else {
            HStack(spacing: 8) {
                ForEach(Array(repos.prefix(2).enumerated()), id: \.element.id) { index, repo in
                    Button {
                        selectedRepoId = repo.id
                    } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(RepoColors.color(for: index))
                                .frame(width: 8, height: 8)
                            Text(repo.name)
                                .lineLimit(1)
                        }
                        .font(.body)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 8)
                        .background(
                            selectedRepoId == repo.id ? IssueCTLColors.action.opacity(0.16) : Color(.tertiarySystemGroupedBackground),
                            in: Capsule()
                        )
                        .foregroundStyle(selectedRepoId == repo.id ? IssueCTLColors.action : .primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("quick-create-repo-\(repo.id)-button")
                }

                Menu {
                    ForEach(repos.dropFirst(2), id: \.id) { repo in
                        Button(repo.fullName) {
                            selectedRepoId = repo.id
                        }
                        .accessibilityIdentifier("quick-create-repo-\(repo.id)-option")
                    }
                    Divider()
                    Button("Local Draft") {
                        selectedRepoId = nil
                    }
                    .accessibilityIdentifier("quick-create-local-draft-option")
                } label: {
                    Text("More")
                        .font(.body)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 8)
                        .background(Color(.tertiarySystemGroupedBackground), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("quick-create-repo-more-button")
            }
        }
    }

    private func sheetCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func loadLabels(owner: String, repo: String) async {
        isLoadingLabels = true
        labelLoadError = nil
        do {
            availableLabels = try await api.repoLabels(owner: owner, repo: repo)
        } catch {
            availableLabels = []
            labelLoadError = "Failed to load labels"
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
                    // Dismiss the sheet; the issue exists. Surface the warning
                    // via the parent's action-error banner (auto-dismisses after 5s).
                    isSubmitting = false
                    onSuccess("Issue created. Note: \(warning)")
                    dismiss()
                    return
                }
                if let warning = assignResponse.labelsWarning {
                    // Issue was created on GitHub but labels could not be applied.
                    // Dismiss the sheet; the issue exists. Surface the warning
                    // via the parent's action-error banner (auto-dismisses after 5s).
                    isSubmitting = false
                    onSuccess("Issue created. Note: \(warning)")
                    dismiss()
                    return
                }
            }

            onSuccess(nil)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
