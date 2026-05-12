import SwiftUI

struct IssueCommentSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(OfflineSyncService.self) private var offlineSync
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void
    let onQueued: () -> Void

    init(
        owner: String,
        repo: String,
        number: Int,
        onSuccess: @escaping () -> Void,
        onQueued: @escaping () -> Void = {}
    ) {
        self.owner = owner
        self.repo = repo
        self.number = number
        self.onSuccess = onSuccess
        self.onQueued = onQueued
    }

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
                    ImageAttachmentButton(owner: owner, repo: repo) { markdown in
                        if commentBody.isEmpty {
                            commentBody = markdown
                        } else {
                            commentBody += "\n\n\(markdown)"
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
            let trimmed = commentBody.trimmingCharacters(in: .whitespacesAndNewlines)
            let requestBody = IssueCommentRequestBody(body: trimmed)
            let response = try await api.commentOnIssue(owner: owner, repo: repo, number: number, body: requestBody)
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to add comment"
            }
        } catch {
            let trimmed = commentBody.trimmingCharacters(in: .whitespacesAndNewlines)
            if isQueueableNetworkFailure(error, isConnected: network.isConnected) {
                offlineSync.enqueueIssueComment(owner: owner, repo: repo, issueNumber: number, body: trimmed)
                onQueued()
                dismiss()
            } else {
                errorMessage = error.localizedDescription
            }
        }
        isSubmitting = false
    }
}
