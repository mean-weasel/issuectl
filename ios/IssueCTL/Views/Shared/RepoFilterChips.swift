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
