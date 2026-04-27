import SwiftUI

struct LaunchView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let issueNumber: Int
    let issueTitle: String
    let comments: [GitHubComment]
    let referencedFiles: [String]
    let repoLocalPath: String?

    @State private var branchName: String
    @State private var workspaceMode: WorkspaceMode
    @State private var showCloneWarning: Bool
    @State private var selectedCommentIndices: Set<Int> = []
    @State private var selectedFilePaths: Set<String> = []
    @State private var preamble = ""
    @State private var isLaunching = false
    @State private var errorMessage: String?
    @State private var launchedPort: Int?
    @State private var launchedDeployment: ActiveDeployment?

    init(owner: String, repo: String, issueNumber: Int, issueTitle: String, comments: [GitHubComment], referencedFiles: [String], repoLocalPath: String? = nil) {
        self.owner = owner
        self.repo = repo
        self.issueNumber = issueNumber
        self.issueTitle = issueTitle
        self.comments = comments
        self.referencedFiles = referencedFiles
        self.repoLocalPath = repoLocalPath

        _branchName = State(initialValue: generateBranchName(issueNumber: issueNumber, issueTitle: issueTitle))
        let needsClone = repoLocalPath == nil || repoLocalPath?.isEmpty == true
        _workspaceMode = State(initialValue: needsClone ? .clone : .worktree)
        _showCloneWarning = State(initialValue: needsClone)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("#\(issueNumber)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(issueTitle)
                            .font(.subheadline)
                            .lineLimit(2)
                    }
                }

                if showCloneWarning {
                    Section {
                        Label("This repository has no local clone. A fresh clone will be created.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                            .font(.subheadline)
                    }
                }

                Section("Workspace Mode") {
                    Picker("Mode", selection: $workspaceMode) {
                        Text("Worktree").tag(WorkspaceMode.worktree)
                        Text("Existing").tag(WorkspaceMode.existing)
                        Text("Clone").tag(WorkspaceMode.clone)
                    }
                    .pickerStyle(.segmented)
                    .disabled(showCloneWarning)
                    .accessibilityIdentifier("workspace-mode-picker")
                }

                Section("Branch Name") {
                    TextField("Branch name", text: $branchName)
                        .autocapitalization(.none)
                        .font(.body.monospaced())
                }

                if !comments.isEmpty {
                    Section("Include Comments") {
                        ForEach(Array(comments.enumerated()), id: \.offset) { index, comment in
                            Toggle(isOn: Binding(
                                get: { selectedCommentIndices.contains(index) },
                                set: { isOn in
                                    if isOn { selectedCommentIndices.insert(index) }
                                    else { selectedCommentIndices.remove(index) }
                                }
                            )) {
                                VStack(alignment: .leading, spacing: 2) {
                                    if let user = comment.user {
                                        Text(user.login)
                                            .font(.caption.weight(.medium))
                                    }
                                    Text(comment.body)
                                        .font(.caption)
                                        .lineLimit(2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                if !referencedFiles.isEmpty {
                    Section("Include Files") {
                        ForEach(referencedFiles, id: \.self) { filePath in
                            Toggle(isOn: Binding(
                                get: { selectedFilePaths.contains(filePath) },
                                set: { isOn in
                                    if isOn { selectedFilePaths.insert(filePath) }
                                    else { selectedFilePaths.remove(filePath) }
                                }
                            )) {
                                Text(filePath)
                                    .font(.caption.monospaced())
                                    .lineLimit(1)
                            }
                        }
                    }
                }

                Section("Preamble (optional)") {
                    TextEditor(text: $preamble)
                        .frame(minHeight: 80)
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
                        Task { await launchSession() }
                    } label: {
                        if isLaunching {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Launch Claude Code", systemImage: "play.fill")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(branchName.isEmpty || isLaunching)
                }
            }
            .navigationTitle("Launch Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                if repoLocalPath == nil {
                    do {
                        let repos = try await api.repos()
                        if let match = repos.first(where: { $0.owner == owner && $0.name == repo }) {
                            let needsClone = match.localPath == nil || match.localPath?.isEmpty == true
                            showCloneWarning = needsClone
                            workspaceMode = needsClone ? .clone : .worktree
                        }
                    } catch {
                        // Could not verify clone status — unlock the picker so user can choose
                        showCloneWarning = false
                    }
                }
            }
            .fullScreenCover(item: $launchedDeployment) { deployment in
                if let port = launchedPort {
                    TerminalView(
                        deployment: deployment,
                        port: port,
                        onEnd: { dismiss() }
                    )
                }
            }
        }
    }

    private func launchSession() async {
        isLaunching = true
        errorMessage = nil

        do {
            let body = LaunchRequestBody(
                branchName: branchName,
                workspaceMode: workspaceMode,
                selectedCommentIndices: Array(selectedCommentIndices).sorted(),
                selectedFilePaths: Array(selectedFilePaths),
                preamble: preamble.isEmpty ? nil : preamble,
                forceResume: nil,
                idempotencyKey: UUID().uuidString
            )
            let response = try await api.launch(
                owner: owner,
                repo: repo,
                number: issueNumber,
                body: body
            )
            if response.success, let deploymentId = response.deploymentId, let port = response.ttydPort {
                launchedPort = port
                launchedDeployment = ActiveDeployment(
                    id: deploymentId,
                    repoId: 0,
                    issueNumber: issueNumber,
                    branchName: branchName,
                    workspaceMode: workspaceMode,
                    workspacePath: "",
                    linkedPrNumber: nil,
                    state: .active,
                    launchedAt: ISO8601DateFormatter().string(from: Date()),
                    endedAt: nil,
                    ttydPort: port,
                    ttydPid: nil,
                    owner: owner,
                    repoName: repo
                )
            } else {
                errorMessage = response.error ?? "Launch failed"
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLaunching = false
    }
}
