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
                    EditRepoStatusCard(
                        fullName: repo.fullName,
                        localPath: localPath.trimmingCharacters(in: .whitespacesAndNewlines),
                        branchPattern: branchPattern.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)

                Section {
                    TextField("Local path", text: $localPath)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .textContentType(.URL)
                } header: {
                    Text("Local Path")
                } footer: {
                    Text("Absolute path to the local git clone. Sessions use this path for worktrees and terminal launch.")
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
                localPath: trimmedPath,
                branchPattern: trimmedPattern
            )
            onUpdated(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EditRepoStatusCard: View {
    let fullName: String
    let localPath: String
    let branchPattern: String

    private var hasLocalPath: Bool {
        !localPath.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: hasLocalPath ? "folder.badge.gearshape" : "folder.badge.questionmark")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(hasLocalPath ? IssueCTLColors.action : .orange)
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 4) {
                    Text(fullName)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(hasLocalPath ? "Ready for local sessions." : "Add a local clone path to enable smoother launches.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                RepoSetupRow(title: "Local clone", value: hasLocalPath ? localPath : "Missing", isComplete: hasLocalPath)
                RepoSetupRow(title: "Branch pattern", value: branchPattern.isEmpty ? "Default" : branchPattern, isComplete: true)
            }
        }
        .padding(14)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct RepoSetupRow: View {
    let title: String
    let value: String
    let isComplete: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: isComplete ? "checkmark.circle.fill" : "exclamationmark.circle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(isComplete ? .green : .orange)
            Text(title)
                .font(.caption.weight(.semibold))
            Spacer(minLength: 8)
            Text(value)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}
