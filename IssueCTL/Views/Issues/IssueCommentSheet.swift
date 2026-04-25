import SwiftUI

struct IssueCommentSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void

    @State private var commentBody = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Comment") {
                    TextEditor(text: $commentBody)
                        .frame(minHeight: 120)
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
                            Label("Add Comment", systemImage: "bubble.left")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(commentBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .navigationTitle("Add Comment")
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
            let requestBody = IssueCommentRequestBody(body: commentBody)
            let response = try await api.commentOnIssue(owner: owner, repo: repo, number: number, body: requestBody)
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to add comment"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
