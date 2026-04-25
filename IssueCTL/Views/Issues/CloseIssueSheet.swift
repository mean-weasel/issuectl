import SwiftUI

struct CloseIssueSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void

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
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
