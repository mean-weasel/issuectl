import SwiftUI

struct RepoFilterChips: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(repos.enumerated()), id: \.element.id) { index, repo in
                    let isSelected = selectedRepoIds.contains(repo.id)
                    let color = RepoColors.color(for: index)

                    Button {
                        if isSelected {
                            selectedRepoIds.remove(repo.id)
                        } else {
                            selectedRepoIds.insert(repo.id)
                        }
                    } label: {
                        HStack(spacing: 4) {
                            if isSelected {
                                Image(systemName: "checkmark")
                                    .font(.caption2)
                            }
                            Text(repo.name)
                                .font(.caption.weight(.medium))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(isSelected ? color.opacity(0.2) : Color.clear)
                        .foregroundStyle(isSelected ? color : .secondary)
                        .overlay(
                            Capsule()
                                .strokeBorder(isSelected ? color : Color.secondary.opacity(0.3), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }
}

struct RepoContextChip: View {
    let title: String
    let value: String
    let systemImage: String
    var tint: Color = IssueCTLColors.action

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)

            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(tint.opacity(0.10), in: Capsule())
        .overlay {
            Capsule()
                .stroke(tint.opacity(0.24), lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("repo-context-\(title.lowercased())")
    }
}

struct RepoContextStrip: View {
    let repos: [Repo]
    var activeRepoFullNames: [String] = []
    var leadingTitle = "Repos"

    var body: some View {
        if shouldShow {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    RepoContextChip(
                        title: leadingTitle,
                        value: repoSummary,
                        systemImage: "folder"
                    )

                    if !activeRepoFullNames.isEmpty && activeRepoFullNames.count < repos.count {
                        RepoContextChip(
                            title: "Active",
                            value: "\(activeRepoFullNames.count)",
                            systemImage: "bolt.fill",
                            tint: .green
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
    }

    private var shouldShow: Bool {
        repos.count > 1 || !activeRepoFullNames.isEmpty
    }

    private var repoSummary: String {
        if repos.isEmpty {
            return "None"
        }
        if repos.count == 1 {
            return repos[0].name
        }
        return "All \(repos.count)"
    }
}
