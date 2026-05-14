import SwiftUI

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
                    Button {
                        activeSheet = .new
                    } label: {
                        Label("New Draft", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
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
            case .new:
                DraftEditorSheet(mode: .new) { title, body, priority in
                    try await store.createDraft(api: api, title: title, body: body, priority: priority)
                }
            case .edit(let draft):
                DraftEditorSheet(mode: .edit(draft)) { title, body, priority in
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
    case new
    case edit(Draft)
    case assign(Draft)

    var id: String {
        switch self {
        case .new: "new"
        case .edit(let draft): "edit-\(draft.id)"
        case .assign(let draft): "assign-\(draft.id)"
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
    let onSave: (String, String?, Priority) async throws -> Void

    @State private var title: String
    @State private var bodyText: String
    @State private var priority: Priority
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(mode: DraftEditorMode, onSave: @escaping (String, String?, Priority) async throws -> Void) {
        self.mode = mode
        self.onSave = onSave

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
                .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
