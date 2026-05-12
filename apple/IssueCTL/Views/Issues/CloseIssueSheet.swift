import SwiftUI

struct CloseIssueSheet: View {
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

    @State private var closingComment = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Closing comment (optional)") {
                    TextEditor(text: $closingComment)
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
                    Button(role: .destructive) {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Close Issue", systemImage: "xmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
            .navigationTitle("Close Issue")
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
            let trimmed = closingComment.trimmingCharacters(in: .whitespacesAndNewlines)
            let requestBody = IssueStateRequestBody(
                state: "closed",
                comment: trimmed.isEmpty ? nil : trimmed
            )
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: requestBody)
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to close issue"
            }
        } catch {
            let trimmed = closingComment.trimmingCharacters(in: .whitespacesAndNewlines)
            if isQueueableNetworkFailure(error, isConnected: network.isConnected) {
                offlineSync.enqueueIssueState(
                    owner: owner,
                    repo: repo,
                    issueNumber: number,
                    state: "closed",
                    comment: trimmed.isEmpty ? nil : trimmed
                )
                onQueued()
                dismiss()
            } else {
                errorMessage = error.localizedDescription
            }
        }
        isSubmitting = false
    }
}
