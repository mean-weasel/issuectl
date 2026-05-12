import SwiftUI

struct AddRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var owner = ""
    @State private var name = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    // Browse state
    @State private var showBrowse = false
    @State private var browseRepos: [GitHubAccessibleRepo] = []
    @State private var isBrowseLoading = false
    @State private var browseError: String?
    @State private var browseSearch = ""
    @State private var isRefreshing = false

    /// Called with the newly added repo on success.
    var onAdded: (Repo) -> Void

    private var isValid: Bool {
        !owner.trimmingCharacters(in: .whitespaces).isEmpty
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var filteredBrowseRepos: [GitHubAccessibleRepo] {
        if browseSearch.isEmpty { return browseRepos }
        let query = browseSearch.lowercased()
        return browseRepos.filter { repo in
            repo.fullName.lowercased().contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AddRepoSetupCard(
                        owner: owner.trimmingCharacters(in: .whitespacesAndNewlines),
                        name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                        isValid: isValid
                    )
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)

                Section {
                    TextField("Owner", text: $owner)
                        .textContentType(.organizationName)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.next)

                    TextField("Repository name", text: $name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.done)
                } header: {
                    Text("GitHub Repository")
                } footer: {
                    Text("Use owner/name exactly as GitHub shows them. You can add the local clone path after the repo is tracked.")
                }

                Section {
                    Button {
                        toggleBrowse()
                    } label: {
                        HStack {
                            Label("Browse GitHub Repos", systemImage: "list.bullet.rectangle")
                            Spacer()
                            Image(systemName: showBrowse ? "chevron.up" : "chevron.down")
                                .foregroundStyle(.secondary)
                        }
                    }

                    if showBrowse {
                        browseContent
                    }
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Add Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Add") {
                            Task { await submit() }
                        }
                        .disabled(!isValid)
                    }
                }
            }
            .interactiveDismissDisabled(isSubmitting)
        }
    }

    private func toggleBrowse() {
        showBrowse.toggle()
        if showBrowse && browseRepos.isEmpty {
            Task { await loadBrowseRepos(refresh: false) }
        }
    }

    // MARK: - Browse Content

    @ViewBuilder
    private var browseContent: some View {
        if isBrowseLoading && browseRepos.isEmpty {
            HStack {
                Spacer()
                ProgressView("Loading repos...")
                Spacer()
            }
        } else {
            if let error = browseError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
            }

            Button {
                Task { await loadBrowseRepos(refresh: true) }
            } label: {
                HStack {
                    Label("Refresh", systemImage: "arrow.clockwise")
                    if isRefreshing {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(isRefreshing || isBrowseLoading)

            if browseRepos.isEmpty && browseError == nil {
                Text("No repos loaded yet. Tap Refresh to fetch from GitHub.")
                    .foregroundStyle(.secondary)
            } else if !browseRepos.isEmpty {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search repos...", text: $browseSearch)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }

                ForEach(filteredBrowseRepos) { repo in
                    Button {
                        owner = repo.owner
                        name = repo.name
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(repo.fullName)
                                    .foregroundStyle(.primary)
                                if let pushedAt = repo.pushedAt {
                                    Text("Pushed: \(pushedAt)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if repo.private {
                                Image(systemName: "lock.fill")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if repo.owner == owner && repo.name == name {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Browse Loading

    private func loadBrowseRepos(refresh: Bool) async {
        if refresh {
            isRefreshing = true
        } else {
            isBrowseLoading = true
        }
        browseError = nil
        defer {
            isBrowseLoading = false
            isRefreshing = false
        }

        do {
            let response = try await api.githubRepos(refresh: refresh)
            browseRepos = response.repos
        } catch {
            browseError = error.localizedDescription
        }
    }

    // MARK: - Submit

    private func submit() async {
        let trimmedOwner = owner.trimmingCharacters(in: .whitespaces)
        let trimmedName = name.trimmingCharacters(in: .whitespaces)

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let repo = try await api.addRepo(owner: trimmedOwner, name: trimmedName)
            onAdded(repo)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct AddRepoSetupCard: View {
    let owner: String
    let name: String
    let isValid: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: isValid ? "checkmark.circle.fill" : "folder.badge.plus")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(isValid ? .green : IssueCTLColors.action)
                    .frame(width: 38, height: 38)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 4) {
                    Text(isValid ? "\(owner)/\(name)" : "Choose a repository")
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text("Track it in issuectl first, then connect the local clone path from Settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 8) {
                SetupStepPill(title: owner.isEmpty ? "Owner" : "Owner set", isComplete: !owner.isEmpty)
                SetupStepPill(title: name.isEmpty ? "Name" : "Name set", isComplete: !name.isEmpty)
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

private struct SetupStepPill: View {
    let title: String
    let isComplete: Bool

    var body: some View {
        Label(title, systemImage: isComplete ? "checkmark.circle.fill" : "circle")
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .foregroundStyle(isComplete ? .green : .secondary)
            .background(Color(.tertiarySystemGroupedBackground), in: Capsule())
    }
}
