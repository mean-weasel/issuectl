import SwiftUI

struct ParseView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    @State private var input = ""
    @State private var isParsing = false
    @State private var isCreating = false
    @State private var parsedIssues: [ParsedIssue] = []
    @State private var acceptedIds: Set<String> = []
    @State private var repoSelections: [String: (owner: String, name: String)] = [:]
    @State private var repos: [Repo] = []
    @State private var errorMessage: String?
    @State private var creationResult: BatchCreateResult?
    @State private var repoLoadError: String?

    private var hasParsed: Bool { !parsedIssues.isEmpty }
    private var acceptedCount: Int { acceptedIds.count }
    private var canCreate: Bool {
        acceptedCount > 0 && acceptedIds.allSatisfy { repoSelections[$0] != nil }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let creationResult {
                    creationResultView(creationResult)
                } else if hasParsed {
                    reviewView
                } else {
                    inputView
                }
            }
            .navigationTitle("Parse Issues")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                await loadRepos()
            }
        }
    }

    // MARK: - Input View

    @ViewBuilder
    private var inputView: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Describe your issues in natural language. You can list multiple issues, use bullet points, or just write freely.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextEditor(text: $input)
                    .frame(minHeight: 200)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Color.secondary.opacity(0.2))
                    )

                Text("\(input.count) / 8192")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            if let repoLoadError {
                VStack(spacing: 8) {
                    Label("Failed to load repositories", systemImage: "exclamationmark.triangle")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                    Text(repoLoadError)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Retry") { Task { await loadRepos() } }
                        .font(.subheadline)
                        .buttonStyle(.bordered)
                }
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }

            Button {
                Task { await parse() }
            } label: {
                HStack {
                    if isParsing {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(isParsing ? "Parsing..." : "Parse with AI")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isParsing || input.count > 8192)

            Spacer()
        }
        .padding()
    }

    // MARK: - Review View

    @ViewBuilder
    private var reviewView: some View {
        VStack(spacing: 0) {
            // Summary bar
            HStack {
                Text("\(parsedIssues.count) issues found")
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text("\(acceptedCount) accepted")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 10)

            Divider()

            List {
                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.subheadline)
                }

                ForEach(parsedIssues) { issue in
                    ParseResultRow(
                        issue: issue,
                        repos: repos,
                        isAccepted: acceptedIds.contains(issue.id),
                        onToggleAccepted: {
                            if acceptedIds.contains(issue.id) {
                                acceptedIds.remove(issue.id)
                            } else {
                                acceptedIds.insert(issue.id)
                            }
                        },
                        selectedRepo: repoSelections[issue.id],
                        onSelectRepo: { owner, name in
                            repoSelections[issue.id] = (owner, name)
                        }
                    )
                }
            }
            .listStyle(.plain)

            Divider()

            // Bottom action bar
            HStack(spacing: 12) {
                Button {
                    // Reset to input view
                    parsedIssues = []
                    acceptedIds = []
                    repoSelections = [:]
                    errorMessage = nil
                } label: {
                    Text("Start Over")
                }
                .buttonStyle(.bordered)

                Button {
                    Task { await createIssues() }
                } label: {
                    HStack {
                        if isCreating {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(isCreating ? "Creating..." : "Create \(acceptedCount) Issue\(acceptedCount == 1 ? "" : "s")")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canCreate || isCreating)
            }
            .padding()
        }
    }

    // MARK: - Creation Result View

    @ViewBuilder
    private func creationResultView(_ result: BatchCreateResult) -> some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: result.failed == 0 ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(result.failed == 0 ? .green : .orange)

            Text(resultSummary(result))
                .font(.headline)
                .multilineTextAlignment(.center)

            if result.failed > 0 {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(result.results.filter { !$0.success }) { item in
                        Label(item.error ?? "Unknown error", systemImage: "xmark.circle")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            Spacer()

            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
        }
        .padding()
    }

    // MARK: - Actions

    private func loadRepos() async {
        repoLoadError = nil
        do {
            repos = try await api.repos()
        } catch {
            repoLoadError = error.localizedDescription
        }
    }

    private func parse() async {
        isParsing = true
        errorMessage = nil
        do {
            let result = try await api.parseNaturalLanguage(input: input)
            parsedIssues = result.issues

            // Auto-accept all and pre-select repos where confidence is high
            acceptedIds = Set(result.issues.map(\.id))
            for issue in result.issues {
                if let owner = issue.repoOwner, let name = issue.repoName,
                   issue.repoConfidence >= 0.7,
                   repos.contains(where: { $0.owner == owner && $0.name == name }) {
                    repoSelections[issue.id] = (owner, name)
                } else if repos.count == 1, let repo = repos.first {
                    // Single repo — auto-assign
                    repoSelections[issue.id] = (repo.owner, repo.name)
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isParsing = false
    }

    private func createIssues() async {
        isCreating = true
        errorMessage = nil
        do {
            let reviewed = parsedIssues
                .filter { acceptedIds.contains($0.id) }
                .map { issue in
                    let repo = repoSelections[issue.id]
                    return ReviewedIssue(
                        id: issue.id,
                        title: issue.title,
                        body: issue.body,
                        owner: repo?.owner ?? "",
                        repo: repo?.name ?? "",
                        labels: issue.suggestedLabels,
                        accepted: true
                    )
                }
            creationResult = try await api.batchCreateIssues(issues: reviewed)
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreating = false
    }

    private func resultSummary(_ result: BatchCreateResult) -> String {
        var parts: [String] = []
        if result.created > 0 {
            parts.append("\(result.created) issue\(result.created == 1 ? "" : "s") created")
        }
        if result.drafted > 0 {
            parts.append("\(result.drafted) draft\(result.drafted == 1 ? "" : "s") saved")
        }
        if result.failed > 0 {
            parts.append("\(result.failed) failed")
        }
        return parts.joined(separator: ", ")
    }
}
