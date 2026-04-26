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
                    TextField("Owner", text: $owner)
                        .textContentType(.organizationName)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    TextField("Repository name", text: $name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("GitHub Repository")
                } footer: {
                    Text("Enter the owner and name exactly as they appear on GitHub, or browse your accessible repos below.")
                }

                Section {
                    Button {
                        showBrowse.toggle()
                        if showBrowse && browseRepos.isEmpty {
                            Task { await loadBrowseRepos(refresh: false) }
                        }
                    } label: {
                        HStack {
                            Label("Browse Accessible Repos", systemImage: "list.bullet.rectangle")
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
                    Label("Refresh from GitHub", systemImage: "arrow.clockwise")
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
