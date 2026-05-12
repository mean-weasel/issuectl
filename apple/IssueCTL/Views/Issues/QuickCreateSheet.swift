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
    @FocusState private var isTitleFocused: Bool

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
            return "Create in \(repo.name)"
        }
        return "Create Draft"
    }

    private var destinationTitle: String {
        selectedRepo.map { "GitHub issue in \($0.name)" } ?? "Local draft"
    }

    private var metadataSummary: String {
        var parts: [String] = []
        if priority != .normal {
            parts.append(priority.rawValue.capitalized)
        }
        if !selectedLabels.isEmpty {
            parts.append("\(selectedLabels.count) labels")
        }
        return parts.isEmpty ? "No extra metadata" : parts.joined(separator: " - ")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Create Issue")
                            .font(.title2.weight(.bold))
                        Text("Capture the work, then add only the metadata you need.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)

                    QuickCreateStatusCard(
                        destination: destinationTitle,
                        metadata: metadataSummary,
                        hasTitle: !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )

                    sheetCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Destination")
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
                                .focused($isTitleFocused)
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
                                Text("Labels, attachments, and priority.")
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
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(250))
                    isTitleFocused = true
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
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button {
                        selectedRepoId = nil
                    } label: {
                        selectorChip(
                            title: "Local Draft",
                            systemImage: "doc.text",
                            color: .secondary,
                            isSelected: selectedRepoId == nil
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("quick-create-local-draft-button")

                    ForEach(Array(repos.prefix(2).enumerated()), id: \.element.id) { index, repo in
                        Button {
                            selectedRepoId = repo.id
                        } label: {
                            selectorChip(
                                title: repo.name,
                                color: RepoColors.color(for: index),
                                isSelected: selectedRepoId == repo.id
                            )
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
    }

    private func selectorChip(
        title: String,
        systemImage: String? = nil,
        color: Color,
        isSelected: Bool
    ) -> some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.caption.weight(.semibold))
            } else {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
            }
            Text(title)
                .lineLimit(1)
        }
        .font(.body)
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(
            isSelected ? IssueCTLColors.action.opacity(0.16) : Color(.tertiarySystemGroupedBackground),
            in: Capsule()
        )
        .foregroundStyle(isSelected ? IssueCTLColors.action : .primary)
    }

    private func sheetCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
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

private struct QuickCreateStatusCard: View {
    let destination: String
    let metadata: String
    let hasTitle: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: hasTitle ? "checkmark.circle.fill" : "square.and.pencil")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(hasTitle ? .green : IssueCTLColors.action)
                .frame(width: 32, height: 32)
                .background(
                    (hasTitle ? Color.green : IssueCTLColors.action).opacity(0.12),
                    in: RoundedRectangle(cornerRadius: IssueCTLColors.iconCornerRadius)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(hasTitle ? "Ready to create" : "Start with a title")
                    .font(.subheadline.weight(.semibold))
                Text(destination)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(metadata)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}
