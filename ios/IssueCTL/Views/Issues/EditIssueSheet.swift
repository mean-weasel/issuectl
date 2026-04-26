import SwiftUI

struct EditIssueSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let currentTitle: String
    let currentBody: String?
    let onSuccess: () -> Void

    @State private var title: String
    @State private var issueBody: String
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(
        owner: String, repo: String, number: Int,
        currentTitle: String, currentBody: String?,
        onSuccess: @escaping () -> Void
    ) {
        self.owner = owner
        self.repo = repo
        self.number = number
        self.currentTitle = currentTitle
        self.currentBody = currentBody
        self.onSuccess = onSuccess
        _title = State(initialValue: currentTitle)
        _issueBody = State(initialValue: currentBody ?? "")
    }

    private var hasChanges: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines) != currentTitle ||
        issueBody.trimmingCharacters(in: .whitespacesAndNewlines) != (currentBody ?? "")
    }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && hasChanges
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Issue title", text: $title)
                        .font(.body)
                }

                Section("Description") {
                    TextEditor(text: $issueBody)
                        .frame(minHeight: 200)
                        .font(.body)
                    ImageAttachmentButton(owner: owner, repo: repo) { markdown in
                        if issueBody.isEmpty {
                            issueBody = markdown
                        } else {
                            issueBody += "\n\n\(markdown)"
                        }
                    }
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
                            Label("Save Changes", systemImage: "checkmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!isValid || isSubmitting)
                }
            }
            .navigationTitle("Edit Issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        do {
            let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedBody = issueBody.trimmingCharacters(in: .whitespacesAndNewlines)

            // Only send fields that changed
            let requestBody = UpdateIssueRequestBody(
                title: trimmedTitle != currentTitle ? trimmedTitle : nil,
                body: trimmedBody != (currentBody ?? "") ? trimmedBody : nil
            )
            let response = try await api.updateIssue(
                owner: owner, repo: repo, number: number,
                body: requestBody
            )
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to update issue"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
