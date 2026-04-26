import SwiftUI

struct EditRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let repo: Repo
    var onUpdated: (Repo) -> Void

    @State private var localPath: String
    @State private var branchPattern: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(repo: Repo, onUpdated: @escaping (Repo) -> Void) {
        self.repo = repo
        self.onUpdated = onUpdated
        _localPath = State(initialValue: repo.localPath ?? "")
        _branchPattern = State(initialValue: repo.branchPattern ?? "")
    }

    private var hasChanges: Bool {
        let currentPath = localPath.trimmingCharacters(in: .whitespaces)
        let currentPattern = branchPattern.trimmingCharacters(in: .whitespaces)
        let originalPath = repo.localPath ?? ""
        let originalPattern = repo.branchPattern ?? ""
        return currentPath != originalPath || currentPattern != originalPattern
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Owner", value: repo.owner)
                    LabeledContent("Name", value: repo.name)
                } header: {
                    Text("Repository")
                }

                Section {
                    TextField("Local path", text: $localPath)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Local Path")
                } footer: {
                    Text("Absolute path to the local git clone (e.g. ~/code/my-repo).")
                }

                Section {
                    TextField("Branch pattern", text: $branchPattern)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Branch Pattern")
                } footer: {
                    Text("Pattern for naming branches (e.g. feature/{{number}}-{{slug}}).")
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Edit Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await save() }
                        }
                        .disabled(!hasChanges)
                    }
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    private func save() async {
        let trimmedPath = localPath.trimmingCharacters(in: .whitespaces)
        let trimmedPattern = branchPattern.trimmingCharacters(in: .whitespaces)

        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            let updated = try await api.updateRepo(
                owner: repo.owner,
                name: repo.name,
                localPath: trimmedPath.isEmpty ? nil : trimmedPath,
                branchPattern: trimmedPattern.isEmpty ? nil : trimmedPattern
            )
            onUpdated(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
