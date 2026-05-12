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
                    DraftRow(draft: draft)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            activeSheet = .edit(draft)
                        }
                        .contextMenu {
                            Button("Edit") {
                                activeSheet = .edit(draft)
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

    var id: String {
        switch self {
        case .new: "new"
        case .edit(let draft): "edit-\(draft.id)"
        }
    }
}

private struct DraftRow: View {
    let draft: Draft

    var body: some View {
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
        .padding(.vertical, 5)
    }

    private var createdDateText: String {
        let date = Date(timeIntervalSince1970: draft.createdAt)
        return date.formatted(date: .abbreviated, time: .shortened)
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
