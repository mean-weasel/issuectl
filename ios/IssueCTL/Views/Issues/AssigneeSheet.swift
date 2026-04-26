import SwiftUI

struct AssigneeSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let currentAssignees: [String]
    let onUpdate: ([String]) -> Void

    @State private var collaborators: [CollaboratorInfo] = []
    @State private var activeAssignees: Set<String>
    @State private var isLoading = true
    @State private var togglingAssignees: Set<String> = []
    @State private var errorMessage: String?
    @State private var loadError: String?
    @State private var searchText = ""

    init(
        owner: String, repo: String, number: Int,
        currentAssignees: [String],
        onUpdate: @escaping ([String]) -> Void
    ) {
        self.owner = owner
        self.repo = repo
        self.number = number
        self.currentAssignees = currentAssignees
        self.onUpdate = onUpdate
        _activeAssignees = State(initialValue: Set(currentAssignees))
    }

    private var filteredCollaborators: [CollaboratorInfo] {
        if searchText.isEmpty {
            return collaborators
        }
        return collaborators.filter {
            $0.login.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading collaborators...")
                } else if loadError != nil {
                    ContentUnavailableView {
                        Label("Failed to Load", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text("Could not load collaborators.")
                    } actions: {
                        Button("Retry") { Task { await loadCollaborators() } }
                    }
                } else if collaborators.isEmpty {
                    ContentUnavailableView {
                        Label("No Collaborators", systemImage: "person.2")
                    } description: {
                        Text("This repository has no collaborators.")
                    }
                } else {
                    List {
                        ForEach(filteredCollaborators) { collaborator in
                            collaboratorRow(collaborator)
                        }
                    }
                    .searchable(text: $searchText, prompt: "Filter collaborators")
                }
            }
            .navigationTitle("Assignees")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .task { await loadCollaborators() }
        }
    }

    @ViewBuilder
    private func collaboratorRow(_ collaborator: CollaboratorInfo) -> some View {
        let isActive = activeAssignees.contains(collaborator.login)
        let isCurrentlyToggling = togglingAssignees.contains(collaborator.login)

        Button {
            Task { await toggle(collaborator: collaborator, isActive: isActive) }
        } label: {
            HStack(spacing: 10) {
                AsyncImage(url: URL(string: collaborator.avatarUrl)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Image(systemName: "person.circle.fill")
                        .resizable()
                        .foregroundStyle(.secondary)
                }
                .frame(width: 28, height: 28)
                .clipShape(Circle())

                Text(collaborator.login)
                    .font(.body)
                    .foregroundStyle(.primary)

                Spacer()

                if isCurrentlyToggling {
                    ProgressView().controlSize(.small)
                } else if isActive {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.blue)
                        .fontWeight(.semibold)
                }
            }
        }
        .disabled(isCurrentlyToggling)
        .accessibilityLabel("\(collaborator.login)\(isActive ? ", assigned" : "")")
        .accessibilityHint(isActive ? "Double-tap to unassign" : "Double-tap to assign")
    }

    private func loadCollaborators() async {
        isLoading = true
        loadError = nil
        do {
            let result = try await api.collaborators(owner: owner, repo: repo)
            collaborators = result.sorted {
                $0.login.localizedCaseInsensitiveCompare($1.login) == .orderedAscending
            }
        } catch {
            loadError = error.localizedDescription
        }
        isLoading = false
    }

    private func toggle(collaborator: CollaboratorInfo, isActive: Bool) async {
        togglingAssignees.insert(collaborator.login)
        errorMessage = nil

        // Optimistic update
        var newAssignees: Set<String>
        if isActive {
            newAssignees = activeAssignees
            newAssignees.remove(collaborator.login)
        } else {
            newAssignees = activeAssignees
            newAssignees.insert(collaborator.login)
        }
        let previousAssignees = activeAssignees
        activeAssignees = newAssignees

        do {
            let finalAssignees = try await api.updateAssignees(
                owner: owner, repo: repo, number: number,
                assignees: Array(newAssignees)
            )
            activeAssignees = Set(finalAssignees)
            onUpdate(finalAssignees)
        } catch {
            // Rollback optimistic update
            activeAssignees = previousAssignees
            errorMessage = error.localizedDescription
        }
        togglingAssignees.remove(collaborator.login)
    }
}
