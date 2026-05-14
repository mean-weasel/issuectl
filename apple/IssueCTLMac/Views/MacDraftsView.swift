import AppKit
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

struct MacDraftsView: View {
    @Environment(APIClient.self) private var api

    let store: MacSidebarStore

    @State private var activeSheet: DraftSheet?
    @State private var deleteTarget: Draft?
    @State private var actionError: String?

    var body: some View {
        VStack(spacing: 0) {
            toolbar

            if store.isLoading && store.drafts.isEmpty {
                ProgressView("Loading drafts...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.drafts.isEmpty {
                ContentUnavailableView {
                    Label("No Drafts", systemImage: "doc.text")
                } description: {
                    Text("Create a local draft, then assign it to a repo when it is ready.")
                } actions: {
                    HStack {
                        Button {
                            activeSheet = .parse
                        } label: {
                            Label("Parse with AI", systemImage: "text.viewfinder")
                        }
                        .buttonStyle(.bordered)
                        .disabled(store.repos.isEmpty)
                        .accessibilityIdentifier("mac-drafts-parse-ai-button")

                        Button {
                            activeSheet = .quickCreate
                        } label: {
                            Label("New Issue", systemImage: "square.and.pencil")
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("mac-drafts-new-issue-button")

                        Button {
                            activeSheet = .new
                        } label: {
                            Label("New Draft", systemImage: "plus")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(store.drafts) { draft in
                    DraftRow(draft: draft) {
                        activeSheet = .assign(draft)
                    }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            activeSheet = .edit(draft)
                        }
                        .contextMenu {
                            Button("Edit") {
                                activeSheet = .edit(draft)
                            }
                            Button("Assign to Repo") {
                                activeSheet = .assign(draft)
                            }
                            Button("Delete", role: .destructive) {
                                deleteTarget = draft
                            }
                        }
                }
                .listStyle(.plain)
            }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .parse:
                MacParseIssueSheet(repos: store.repos) {
                    await store.load(api: api, refresh: true)
                }
            case .quickCreate:
                DirectIssueCreateSheet(repos: store.repos) { repo, title, body, priority, labels in
                    _ = try await store.createIssue(
                        api: api,
                        title: title,
                        body: body,
                        priority: priority,
                        repo: repo,
                        labels: labels
                    )
                } loadLabels: { repo in
                    try await api.repoLabels(owner: repo.owner, repo: repo.name)
                }
            case .new:
                DraftEditorSheet(mode: .new, repos: store.repos) { title, body, priority in
                    try await store.createDraft(api: api, title: title, body: body, priority: priority)
                }
            case .edit(let draft):
                DraftEditorSheet(mode: .edit(draft), repos: store.repos) { title, body, priority in
                    try await store.updateDraft(api: api, id: draft.id, title: title, body: body, priority: priority)
                }
            case .assign(let draft):
                DraftAssignSheet(draft: draft, repos: store.repos) { repo, labels in
                    _ = try await store.assignDraftWithLabels(api: api, id: draft.id, repo: repo, labels: labels)
                } loadLabels: { repo in
                    try await api.repoLabels(owner: repo.owner, repo: repo.name)
                }
            }
        }
        .confirmationDialog(
            "Delete this draft?",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete Draft", role: .destructive) {
                guard let draft = deleteTarget else { return }
                Task { await deleteDraft(draft) }
            }
            Button("Cancel", role: .cancel) {
                deleteTarget = nil
            }
        } message: {
            if let deleteTarget {
                Text(deleteTarget.title)
            }
        }
        .alert("Draft Action Failed", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            if let actionError {
                Text(actionError)
            }
        }
    }

    private var toolbar: some View {
        HStack {
            if let actionError {
                Text(actionError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            } else {
                Text("\(store.drafts.count) drafts")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                activeSheet = .parse
            } label: {
                Label("Parse with AI", systemImage: "text.viewfinder")
            }
            .buttonStyle(.bordered)
            .disabled(store.repos.isEmpty)
            .accessibilityIdentifier("mac-drafts-parse-ai-button")

            Button {
                activeSheet = .quickCreate
            } label: {
                Label("New Issue", systemImage: "square.and.pencil")
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.repos.isEmpty)
            .accessibilityIdentifier("mac-drafts-new-issue-button")

            Button {
                activeSheet = .new
            } label: {
                Label("New Draft", systemImage: "plus")
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func deleteDraft(_ draft: Draft) async {
        do {
            try await store.deleteDraft(api: api, id: draft.id)
            deleteTarget = nil
        } catch {
            actionError = error.localizedDescription
        }
    }
}

private enum DraftSheet: Identifiable {
    case parse
    case quickCreate
    case new
    case edit(Draft)
    case assign(Draft)

    var id: String {
        switch self {
        case .parse: "parse"
        case .quickCreate: "quick-create"
        case .new: "new"
        case .edit(let draft): "edit-\(draft.id)"
        case .assign(let draft): "assign-\(draft.id)"
        }
    }
}

private struct MacParseIssueSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let repos: [Repo]
    let onComplete: () async -> Void

    @State private var input = ""
    @State private var isParsing = false
    @State private var isCreating = false
    @State private var reviewState: MacParseReviewState?
    @State private var creationResult: BatchCreateResult?
    @State private var errorMessage: String?

    private var trimmedInput: String {
        input.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if let creationResult {
                resultView(creationResult)
            } else if let reviewState {
                reviewView(reviewState)
            } else {
                inputView
            }
        }
        .padding(20)
        .frame(width: 520, height: 580)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("Parse Issues")
                    .font(.headline)
                Text("Turn free-form notes into reviewed issues.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Cancel", role: .cancel) {
                dismiss()
            }
            .keyboardShortcut(.cancelAction)
        }
    }

    private var inputView: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextEditor(text: $input)
                .font(.body)
                .frame(minHeight: 280)
                .scrollContentBackground(.hidden)
                .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                .overlay {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                }
                .accessibilityIdentifier("mac-parse-input-field")

            VStack(alignment: .leading, spacing: 10) {
                Text("\(input.count) / 8192")
                    .font(.caption)
                    .foregroundStyle(input.count > 8192 ? .red : .secondary)
                    .accessibilityIdentifier("mac-parse-character-count")

                Button {
                    Task { await parse() }
                } label: {
                    if isParsing {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Parse with AI")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(trimmedInput.isEmpty || input.count > 8192 || isParsing || repos.isEmpty)
                .accessibilityIdentifier("mac-parse-submit-button")
            }

            if repos.isEmpty {
                Label("Add a tracked repository before creating parsed issues.", systemImage: "tray")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            errorLabel
            Spacer()
        }
    }

    private func reviewView(_ reviewState: MacParseReviewState) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("\(reviewState.parsedIssues.count) issues found")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(reviewState.acceptedCount) accepted")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-parse-accepted-count")
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(reviewState.parsedIssues) { issue in
                        parseIssueRow(issue)
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(maxHeight: .infinity)

            errorLabel

            HStack {
                Button("Start Over") {
                    self.reviewState = nil
                    errorMessage = nil
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-parse-start-over-button")

                Button {
                    Task { await createIssues() }
                } label: {
                    if isCreating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Create \(reviewState.acceptedCount) Issue\(reviewState.acceptedCount == 1 ? "" : "s")")
                    }
                }
                .frame(minWidth: 150, alignment: .leading)
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(!reviewState.canCreate || isCreating)
                .accessibilityIdentifier("mac-parse-create-button")
            }
        }
    }

    private func parseIssueRow(_ issue: ParsedIssue) -> some View {
        let isAccepted = reviewState?.isAccepted(issue.id) ?? false
        let selectedRepo = reviewState?.selectedRepo(for: issue.id)

        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(issue.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isAccepted ? .primary : .secondary)
                        .strikethrough(!isAccepted)
                        .accessibilityIdentifier("mac-parse-issue-\(issue.id)-title")
                    if !issue.body.isEmpty {
                        Text(issue.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer()
                Button {
                    toggleAccepted(issue.id)
                } label: {
                    Label(isAccepted ? "Accepted" : "Rejected", systemImage: isAccepted ? "checkmark.circle.fill" : "circle")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-parse-issue-\(issue.id)-accept-toggle")
            }

            HStack(spacing: 8) {
                Text(issue.type.capitalized)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.12), in: Capsule())

                if issue.clarity != "clear" {
                    Label(issue.clarity == "ambiguous" ? "Ambiguous" : "Unknown repo", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }

                ForEach(issue.suggestedLabels.prefix(3), id: \.self) { label in
                    Text(label)
                        .font(.caption2)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.secondary.opacity(0.1), in: Capsule())
                }
            }

            if isAccepted {
                HStack(spacing: 8) {
                    Text("Repository")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ForEach(repos) { repo in
                        Button(repo.fullName) {
                            selectRepo(repo, for: issue.id)
                        }
                        .buttonStyle(.bordered)
                        .fontWeight(selectedRepo?.fullName == repo.fullName ? .semibold : .regular)
                        .controlSize(.small)
                        .accessibilityIdentifier("mac-parse-issue-\(issue.id)-repo-\(repo.fullName)")
                    }
                }
            }
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.secondary.opacity(0.16), lineWidth: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            toggleAccepted(issue.id)
        }
        .opacity(isAccepted ? 1 : 0.65)
    }

    private func resultView(_ result: BatchCreateResult) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: result.failed == 0 ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(result.failed == 0 ? .green : .orange)
            Text(resultSummary(result))
                .font(.headline)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("mac-parse-result-summary")

            if result.failed > 0 {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(result.results.filter { !$0.success }) { item in
                        Label(item.error ?? "Unknown error", systemImage: "xmark.circle")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }

            Spacer()
            Button("Done") {
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier("mac-parse-done-button")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var errorLabel: some View {
        if let errorMessage {
            Label(errorMessage, systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("mac-parse-error")
        }
    }

    private func parse() async {
        isParsing = true
        errorMessage = nil
        defer { isParsing = false }

        do {
            let parsed = try await api.parseNaturalLanguage(input: input)
            reviewState = MacParseReviewState(parsedIssues: parsed.issues, repos: repos)
            if parsed.issues.isEmpty {
                errorMessage = "No issues were parsed from the input."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func toggleAccepted(_ id: String) {
        guard var state = reviewState else { return }
        state.toggleAccepted(id)
        reviewState = state
    }

    private func selectRepo(_ repo: Repo, for id: String) {
        guard var state = reviewState else { return }
        state.selectRepo(repo, for: id)
        reviewState = state
    }

    private func createIssues() async {
        guard let reviewState else { return }
        isCreating = true
        errorMessage = nil
        defer { isCreating = false }

        do {
            let result = try await api.batchCreateIssues(issues: reviewState.reviewedIssues())
            creationResult = result
            await onComplete()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resultSummary(_ result: BatchCreateResult) -> String {
        var parts: [String] = []
        if result.created > 0 {
            parts.append("\(result.created) issue\(result.created == 1 ? "" : "s") created")
        }
        if result.drafted > 0 {
            parts.append("\(result.drafted) draft\(result.drafted == 1 ? "" : "s") saved")
        }
        if result.failed > 0 {
            parts.append("\(result.failed) failed")
        }
        return parts.isEmpty ? "No issues created" : parts.joined(separator: ", ")
    }
}

struct MacParseRepoSelection: Equatable {
    let owner: String
    let name: String

    var fullName: String {
        "\(owner)/\(name)"
    }
}

struct MacParseReviewState {
    private(set) var parsedIssues: [ParsedIssue]
    private(set) var acceptedIds: Set<String>
    private(set) var repoSelections: [String: MacParseRepoSelection]

    init(parsedIssues: [ParsedIssue], repos: [Repo]) {
        self.parsedIssues = parsedIssues
        self.acceptedIds = Set(parsedIssues.map(\.id))
        self.repoSelections = [:]

        for issue in parsedIssues {
            if let owner = issue.repoOwner,
               let name = issue.repoName,
               issue.repoConfidence >= 0.7,
               repos.contains(where: { $0.owner == owner && $0.name == name }) {
                repoSelections[issue.id] = MacParseRepoSelection(owner: owner, name: name)
            } else if repos.count == 1, let repo = repos.first {
                repoSelections[issue.id] = MacParseRepoSelection(owner: repo.owner, name: repo.name)
            }
        }
    }

    var acceptedCount: Int {
        acceptedIds.count
    }

    var canCreate: Bool {
        acceptedCount > 0 && acceptedIds.allSatisfy { repoSelections[$0] != nil }
    }

    func isAccepted(_ id: String) -> Bool {
        acceptedIds.contains(id)
    }

    func selectedRepo(for id: String) -> MacParseRepoSelection? {
        repoSelections[id]
    }

    mutating func toggleAccepted(_ id: String) {
        if acceptedIds.contains(id) {
            acceptedIds.remove(id)
        } else {
            acceptedIds.insert(id)
        }
    }

    mutating func selectRepo(_ repo: Repo, for id: String) {
        repoSelections[id] = MacParseRepoSelection(owner: repo.owner, name: repo.name)
    }

    func reviewedIssues() -> [ReviewedIssue] {
        parsedIssues
            .filter { acceptedIds.contains($0.id) }
            .compactMap { issue in
                guard let repo = repoSelections[issue.id] else { return nil }
                return ReviewedIssue(
                    id: issue.id,
                    title: issue.title,
                    body: issue.body,
                    owner: repo.owner,
                    repo: repo.name,
                    labels: issue.suggestedLabels,
                    accepted: true
                )
            }
    }
}

private struct DraftRow: View {
    let draft: Draft
    let onAssign: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(draft.title)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    if let priority = draft.priority, priority != .normal {
                        PriorityPill(priority: priority)
                    }
                }

                if let body = draft.body, !body.isEmpty {
                    Text(body)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Text(createdDateText)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Button {
                onAssign()
            } label: {
                Label("Assign", systemImage: "arrow.up.doc")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityIdentifier("mac-draft-assign-\(draft.id)")
        }
        .padding(.vertical, 5)
    }

    private var createdDateText: String {
        let date = Date(timeIntervalSince1970: draft.createdAt)
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

struct DirectIssueCreateSheet: View {
    @Environment(\.dismiss) private var dismiss

    let repos: [Repo]
    let onCreate: (Repo, String, String?, Priority, [String]) async throws -> Void
    let loadLabels: (Repo) async throws -> [GitHubLabel]

    @State private var title = ""
    @State private var bodyText = ""
    @State private var selectedRepoId: Int?
    @State private var priority: Priority = .normal
    @State private var availableLabels: [GitHubLabel] = []
    @State private var selectedLabels: Set<String> = []
    @State private var isLoadingLabels = false
    @State private var isCreating = false
    @State private var isUploadingImage = false
    @State private var errorMessage: String?

    init(
        repos: [Repo],
        onCreate: @escaping (Repo, String, String?, Priority, [String]) async throws -> Void,
        loadLabels: @escaping (Repo) async throws -> [GitHubLabel]
    ) {
        self.repos = repos
        self.onCreate = onCreate
        self.loadLabels = loadLabels
        _selectedRepoId = State(initialValue: repos.first?.id)
    }

    private var selectedRepo: Repo? {
        guard let selectedRepoId else { return nil }
        return repos.first { $0.id == selectedRepoId }
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedBody: String? {
        let value = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("New Issue")
                    .font(.headline)
                Text("Create directly in a tracked repository.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if repos.isEmpty {
                ContentUnavailableView(
                    "No Repositories",
                    systemImage: "tray",
                    description: Text("Add a tracked repository before creating issues.")
                )
                .frame(minHeight: 240)
            } else {
                Picker("Repository", selection: $selectedRepoId) {
                    ForEach(repos) { repo in
                        Text(repo.fullName).tag(Optional(repo.id))
                    }
                }
                .accessibilityIdentifier("mac-quick-create-repo-picker")
                .onChange(of: selectedRepoId) { _, _ in
                    selectedLabels = []
                    Task { await loadRepoLabels() }
                }

                TextField("Issue title", text: $title)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("mac-quick-create-title-field")

                TextEditor(text: $bodyText)
                    .font(.body)
                    .frame(minHeight: 110)
                    .overlay {
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.secondary.opacity(0.25))
                    }
                    .accessibilityIdentifier("mac-quick-create-body-field")

                if let selectedRepo {
                    MacImageAttachmentButton(
                        owner: selectedRepo.owner,
                        repo: selectedRepo.name,
                        accessibilityPrefix: "mac-quick-create",
                        isUploading: $isUploadingImage
                    ) { markdown in
                        appendMarkdown(markdown, to: &bodyText)
                    }
                }

                Picker("Priority", selection: $priority) {
                    Text("Low").tag(Priority.low)
                    Text("Normal").tag(Priority.normal)
                    Text("High").tag(Priority.high)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("mac-quick-create-priority-picker")

                GroupBox("Labels") {
                    if isLoadingLabels {
                        ProgressView("Loading labels...")
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else if availableLabels.isEmpty {
                        ContentUnavailableView("No Labels", systemImage: "tag")
                            .frame(minHeight: 120)
                    } else {
                        List(availableLabels) { label in
                            labelRow(label)
                        }
                        .frame(minHeight: 160)
                    }
                }
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-quick-create-error")
            }

            HStack {
                Button("Cancel", role: .cancel) {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button {
                    Task { await create() }
                } label: {
                    if isCreating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Create Issue")
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isCreating || isUploadingImage || selectedRepo == nil || trimmedTitle.isEmpty)
                .accessibilityIdentifier("mac-quick-create-submit-button")
            }
        }
        .padding(20)
        .frame(width: 520)
        .task { await loadRepoLabels() }
    }

    private func labelRow(_ label: GitHubLabel) -> some View {
        let isSelected = selectedLabels.contains(label.name)

        return Button {
            if isSelected {
                selectedLabels.remove(label.name)
            } else {
                selectedLabels.insert(label.name)
            }
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(macDraftHex: label.color) ?? .secondary)
                    .frame(width: 12, height: 12)
                Text(label.name)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.blue)
                }
            }
        }
        .accessibilityIdentifier("mac-quick-create-label-\(label.name)")
    }

    private func loadRepoLabels() async {
        guard let selectedRepo else { return }
        isLoadingLabels = true
        errorMessage = nil
        defer { isLoadingLabels = false }

        do {
            availableLabels = try await loadLabels(selectedRepo)
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        } catch {
            availableLabels = []
            errorMessage = error.localizedDescription
        }
    }

    private func create() async {
        guard let selectedRepo else { return }
        isCreating = true
        errorMessage = nil
        defer { isCreating = false }

        do {
            try await onCreate(selectedRepo, trimmedTitle, trimmedBody, priority, Array(selectedLabels).sorted())
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct DraftAssignSheet: View {
    @Environment(\.dismiss) private var dismiss

    let draft: Draft
    let repos: [Repo]
    let onAssign: (Repo, [String]) async throws -> Void
    let loadLabels: (Repo) async throws -> [GitHubLabel]

    @State private var selectedRepoId: Int?
    @State private var availableLabels: [GitHubLabel] = []
    @State private var selectedLabels: Set<String> = []
    @State private var isLoadingLabels = false
    @State private var isAssigning = false
    @State private var errorMessage: String?

    init(
        draft: Draft,
        repos: [Repo],
        onAssign: @escaping (Repo, [String]) async throws -> Void,
        loadLabels: @escaping (Repo) async throws -> [GitHubLabel]
    ) {
        self.draft = draft
        self.repos = repos
        self.onAssign = onAssign
        self.loadLabels = loadLabels
        _selectedRepoId = State(initialValue: repos.first?.id)
    }

    private var selectedRepo: Repo? {
        guard let selectedRepoId else { return nil }
        return repos.first { $0.id == selectedRepoId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Assign Draft")
                        .font(.headline)
                    Text(draft.title)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer()
            }

            if repos.isEmpty {
                ContentUnavailableView(
                    "No Repositories",
                    systemImage: "tray",
                    description: Text("Add a tracked repository before assigning drafts.")
                )
                .frame(minHeight: 220)
            } else {
                Picker("Repository", selection: $selectedRepoId) {
                    ForEach(repos) { repo in
                        Text(repo.fullName).tag(Optional(repo.id))
                    }
                }
                .accessibilityIdentifier("mac-assign-draft-repo-picker")
                .onChange(of: selectedRepoId) { _, _ in
                    selectedLabels = []
                    Task { await loadRepoLabels() }
                }

                if isLoadingLabels {
                    ProgressView("Loading labels...")
                        .frame(maxWidth: .infinity, minHeight: 160)
                } else if availableLabels.isEmpty {
                    ContentUnavailableView("No Labels", systemImage: "tag")
                        .frame(minHeight: 160)
                } else {
                    List(availableLabels) { label in
                        labelRow(label)
                    }
                    .frame(minHeight: 220)
                }
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-assign-draft-error")
            }

            HStack {
                Button("Cancel", role: .cancel) {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button {
                    Task { await assign() }
                } label: {
                    if isAssigning {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Assign")
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isAssigning || selectedRepo == nil)
                .accessibilityIdentifier("mac-assign-draft-submit-button")
            }
        }
        .padding(20)
        .frame(width: 480)
        .task { await loadRepoLabels() }
    }

    private func labelRow(_ label: GitHubLabel) -> some View {
        let isSelected = selectedLabels.contains(label.name)

        return Button {
            if isSelected {
                selectedLabels.remove(label.name)
            } else {
                selectedLabels.insert(label.name)
            }
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(macDraftHex: label.color) ?? .secondary)
                    .frame(width: 12, height: 12)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label.name)
                    if let description = label.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.blue)
                }
            }
        }
        .accessibilityIdentifier("mac-assign-draft-label-\(label.name)")
    }

    private func loadRepoLabels() async {
        guard let selectedRepo else { return }
        isLoadingLabels = true
        errorMessage = nil
        defer { isLoadingLabels = false }

        do {
            availableLabels = try await loadLabels(selectedRepo)
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        } catch {
            availableLabels = []
            errorMessage = error.localizedDescription
        }
    }

    private func assign() async {
        guard let selectedRepo else { return }
        isAssigning = true
        errorMessage = nil
        defer { isAssigning = false }

        do {
            try await onAssign(selectedRepo, Array(selectedLabels).sorted())
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct DraftEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    let mode: DraftEditorMode
    let repos: [Repo]
    let onSave: (String, String?, Priority) async throws -> Void

    @State private var title: String
    @State private var bodyText: String
    @State private var attachmentRepoId: Int?
    @State private var priority: Priority
    @State private var isSaving = false
    @State private var isUploadingImage = false
    @State private var errorMessage: String?

    init(mode: DraftEditorMode, repos: [Repo], onSave: @escaping (String, String?, Priority) async throws -> Void) {
        self.mode = mode
        self.repos = repos
        self.onSave = onSave
        _attachmentRepoId = State(initialValue: repos.first?.id)

        switch mode {
        case .new:
            _title = State(initialValue: "")
            _bodyText = State(initialValue: "")
            _priority = State(initialValue: .normal)
        case .edit(let draft):
            _title = State(initialValue: draft.title)
            _bodyText = State(initialValue: draft.body ?? "")
            _priority = State(initialValue: draft.priority ?? .normal)
        }
    }

    private var attachmentRepo: Repo? {
        guard let attachmentRepoId else { return nil }
        return repos.first { $0.id == attachmentRepoId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(mode.title)
                        .font(.headline)
                    Text("Local draft")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Title")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextField("Draft title", text: $title)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Body")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextEditor(text: $bodyText)
                    .font(.body)
                    .frame(minHeight: 180)
                    .scrollContentBackground(.hidden)
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                    .overlay {
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                    }
            }

            if !repos.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Attachments")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    HStack {
                        Picker("Upload to", selection: $attachmentRepoId) {
                            ForEach(repos) { repo in
                                Text(repo.fullName).tag(Optional(repo.id))
                            }
                        }
                        .frame(maxWidth: 260)
                        .accessibilityIdentifier("mac-draft-attachment-repo-picker")

                        if let attachmentRepo {
                            MacImageAttachmentButton(
                                owner: attachmentRepo.owner,
                                repo: attachmentRepo.name,
                                accessibilityPrefix: "mac-draft",
                                isUploading: $isUploadingImage
                            ) { markdown in
                                appendMarkdown(markdown, to: &bodyText)
                            }
                        }
                    }
                }
            }

            Picker("Priority", selection: $priority) {
                ForEach(Priority.allCases, id: \.self) { priority in
                    Text(priority.displayName).tag(priority)
                }
            }
            .pickerStyle(.segmented)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Button("Cancel", role: .cancel) {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(mode.saveTitle)
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isSaving || isUploadingImage || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 520)
    }

    private func save() async {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return }

        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await onSave(cleanTitle, cleanBody.isEmpty ? nil : cleanBody, priority)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct MacImageAttachmentButton: View {
    @Environment(APIClient.self) private var api

    let owner: String
    let repo: String
    let accessibilityPrefix: String
    @Binding var isUploading: Bool
    let onUpload: (String) -> Void

    @State private var errorMessage: String?

    var body: some View {
        HStack(spacing: 8) {
            Button {
                Task { await chooseAndUploadImage() }
            } label: {
                if isUploading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Label("Attach Image", systemImage: "photo")
                }
            }
            .buttonStyle(.bordered)
            .disabled(isUploading)
            .accessibilityIdentifier("\(accessibilityPrefix)-image-attachment-button")

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(1)
                    .accessibilityIdentifier("\(accessibilityPrefix)-image-attachment-error")
            }
        }
    }

    @MainActor
    private func chooseAndUploadImage() async {
        errorMessage = nil

        if ProcessInfo.processInfo.environment["ISSUECTL_MAC_UI_FIXTURE_API"] == "1" {
            await uploadFixtureImage()
            return
        }

        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true

        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let data = try Data(contentsOf: url)
            await uploadImageData(data)
        } catch {
            errorMessage = "Could not load image"
        }
    }

    private func uploadFixtureImage() async {
        if ProcessInfo.processInfo.environment["ISSUECTL_MAC_UI_FIXTURE_IMAGE_UPLOAD_FAILURE"] == "1" {
            isUploading = true
            try? await Task.sleep(for: .milliseconds(150))
            errorMessage = "Upload failed"
            isUploading = false
            return
        }

        await uploadImageData(MacImageAttachmentProcessor.fixturePNGData)
    }

    private func uploadImageData(_ data: Data) async {
        let trace = PerformanceTrace.begin("mac_image_attachment.upload", metadata: "repo=\(owner)/\(repo)")
        isUploading = true
        errorMessage = nil
        defer {
            PerformanceTrace.end(trace, metadata: "success=\(errorMessage == nil)")
            isUploading = false
        }

        do {
            let imageData = try await MacImageAttachmentProcessor.preparedJPEGData(from: data)
            let url = try await api.uploadImageData(imageData, owner: owner, repo: repo)
            onUpload("![image](\(url))")
        } catch MacImageAttachmentProcessor.ProcessingError.invalidImage {
            errorMessage = "Invalid image data"
        } catch {
            errorMessage = "Upload failed"
        }
    }
}

enum MacImageAttachmentProcessor {
    enum ProcessingError: Error {
        case invalidImage
    }

    static let fixturePNGData = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAADtGLyqAAAAEklEQVQIHWP8DwQMQMAEIkAAAD34BACALvQ5AAAAAElFTkSuQmCC")!

    private static let maxPixelSize = 1_600
    private static let compressionQuality: CGFloat = 0.8

    static func preparedJPEGData(from data: Data) async throws -> Data {
        try await Task.detached(priority: .userInitiated) {
            guard let imageSource = CGImageSourceCreateWithData(data as CFData, [
                kCGImageSourceShouldCache: false,
            ] as CFDictionary) else {
                throw ProcessingError.invalidImage
            }

            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            ]

            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
                throw ProcessingError.invalidImage
            }

            let bitmap = NSBitmapImageRep(cgImage: cgImage)
            guard let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: compressionQuality]) else {
                throw ProcessingError.invalidImage
            }
            return jpegData
        }.value
    }
}

func appendMarkdown(_ markdown: String, to text: inout String) {
    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        text = markdown
    } else {
        text += "\n\n\(markdown)"
    }
}

private enum DraftEditorMode {
    case new
    case edit(Draft)

    var title: String {
        switch self {
        case .new: "New Draft"
        case .edit: "Edit Draft"
        }
    }

    var saveTitle: String {
        switch self {
        case .new: "Create"
        case .edit: "Save"
        }
    }
}

private struct PriorityPill: View {
    let priority: Priority

    var body: some View {
        Text(priority.displayName)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(priority.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(priority.tint)
    }
}

private extension Priority {
    var displayName: String {
        switch self {
        case .low: "Low"
        case .normal: "Normal"
        case .high: "High"
        }
    }

    var tint: Color {
        switch self {
        case .low: .secondary
        case .normal: .blue
        case .high: .red
        }
    }
}

private extension Color {
    init?(macDraftHex: String) {
        var value = macDraftHex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") {
            value.removeFirst()
        }
        guard value.count == 6, let integer = Int(value, radix: 16) else { return nil }
        self.init(
            red: Double((integer >> 16) & 0xFF) / 255.0,
            green: Double((integer >> 8) & 0xFF) / 255.0,
            blue: Double(integer & 0xFF) / 255.0
        )
    }
}
