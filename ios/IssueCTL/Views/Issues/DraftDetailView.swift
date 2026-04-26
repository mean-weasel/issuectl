import SwiftUI

struct DraftDetailView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let draft: Draft
    let onSaved: () -> Void

    @State private var title: String
    @State private var bodyText: String
    @State private var priority: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var hasChanges = false

    init(draft: Draft, onSaved: @escaping () -> Void) {
        self.draft = draft
        self.onSaved = onSaved
        _title = State(initialValue: draft.title)
        _bodyText = State(initialValue: draft.body ?? "")
        _priority = State(initialValue: draft.priority ?? "normal")
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
            }

            Section("Description") {
                TextEditor(text: $bodyText)
                    .font(.body)
                    .frame(minHeight: 120)
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
        }
        .navigationTitle("Edit Draft")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
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
            }
        }
        .onChange(of: title) { _, _ in updateHasChanges() }
        .onChange(of: bodyText) { _, _ in updateHasChanges() }
        .onChange(of: priority) { _, _ in updateHasChanges() }
    }

    private func updateHasChanges() {
        let titleChanged = title != draft.title
        let bodyChanged = bodyText != (draft.body ?? "")
        let priorityChanged = priority != (draft.priority ?? "normal")
        hasChanges = titleChanged || bodyChanged || priorityChanged
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let updateBody = UpdateDraftRequestBody(
                title: trimmedTitle != draft.title ? trimmedTitle : nil,
                body: trimmedBody != (draft.body ?? "") ? trimmedBody : nil,
                priority: priority != (draft.priority ?? "normal") ? priority : nil
            )
            let response = try await api.updateDraft(id: draft.id, body: updateBody)
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
}
