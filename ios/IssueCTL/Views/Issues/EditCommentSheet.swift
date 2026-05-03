import SwiftUI

struct EditCommentSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let commentId: Int
    let currentBody: String
    let onSuccess: () -> Void

    @State private var commentBody: String
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(
        owner: String, repo: String, number: Int,
        commentId: Int, currentBody: String,
        onSuccess: @escaping () -> Void
    ) {
        self.owner = owner
        self.repo = repo
        self.number = number
        self.commentId = commentId
        self.currentBody = currentBody
        self.onSuccess = onSuccess
        _commentBody = State(initialValue: currentBody)
    }

    private var hasChanges: Bool {
        commentBody.trimmingCharacters(in: .whitespacesAndNewlines) != currentBody
    }

    private var isValid: Bool {
        !commentBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && hasChanges
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Comment") {
                    TextEditor(text: $commentBody)
                        .frame(minHeight: 200)
                        .font(.body)
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
                            Label("Save", systemImage: "checkmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!isValid || isSubmitting)
                }
            }
            .navigationTitle("Edit Comment")
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
            let trimmedBody = commentBody.trimmingCharacters(in: .whitespacesAndNewlines)
            let requestBody = EditCommentRequestBody(
                commentId: commentId,
                body: trimmedBody
            )
            let response = try await api.editComment(
                owner: owner, repo: repo, number: number,
                body: requestBody
            )
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to edit comment"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
