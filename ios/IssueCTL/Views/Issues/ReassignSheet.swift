import SwiftUI

struct ReassignSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let owner: String
    let repo: String
    let number: Int
    let issueTitle: String
    var onSuccess: (String, String, Int) -> Void

    @State private var repos: [Repo] = []
    @State private var selectedRepo: Repo?
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var availableRepos: [Repo] {
        repos.filter { $0.owner != owner || $0.name != repo }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Issue", value: "#\(number)")
                    Text(issueTitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Source")
                } footer: {
                    Text("This issue will be re-created in the target repo and closed in \(owner)/\(repo).")
                }

                Section {
                    if isLoading {
                        HStack {
                            Spacer()
                            ProgressView("Loading repos...")
                            Spacer()
                        }
                    } else if availableRepos.isEmpty {
                        Text("No other tracked repos available.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(availableRepos) { targetRepo in
                            Button {
                                selectedRepo = targetRepo
                            } label: {
                                HStack {
                                    Text(targetRepo.fullName)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if selectedRepo?.id == targetRepo.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.blue)
                                    }
                                }
                            }
                        }
                    }
                } header: {
                    Text("Target Repository")
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Reassign Issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Reassign") {
                            Task { await submit() }
                        }
                        .disabled(selectedRepo == nil)
                    }
                }
            }
            .interactiveDismissDisabled(isSubmitting)
            .task { await loadRepos() }
        }
    }

    private func loadRepos() async {
        isLoading = true
        do {
            repos = try await api.repos()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func submit() async {
        guard let target = selectedRepo else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let response = try await api.reassignIssue(
                owner: owner, repo: repo, number: number,
                targetOwner: target.owner, targetRepo: target.name
            )
            if response.success, let newNumber = response.newIssueNumber,
               let newOwner = response.newOwner, let newRepo = response.newRepo {
                onSuccess(newOwner, newRepo, newNumber)
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to reassign issue"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
