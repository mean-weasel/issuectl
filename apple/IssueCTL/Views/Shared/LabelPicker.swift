import SwiftUI

struct LabelPicker: View {
    let labels: [GitHubLabel]
    @Binding var selectedLabels: Set<String>
    let isLoading: Bool

    var body: some View {
        if isLoading {
            HStack {
                ProgressView()
                    .controlSize(.small)
                Text("Loading labels...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } else if labels.isEmpty {
            Text("No labels available")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else {
            FlowLayout(spacing: 8) {
                ForEach(labels) { label in
                    LabelChip(
                        label: label,
                        isSelected: selectedLabels.contains(label.name),
                        onToggle: {
                            if selectedLabels.contains(label.name) {
                                selectedLabels.remove(label.name)
                            } else {
                                selectedLabels.insert(label.name)
                            }
                        }
                    )
                }
            }
        }
    }
}

private struct LabelChip: View {
    let label: GitHubLabel
    let isSelected: Bool
    let onToggle: () -> Void

    private var labelColor: Color {
        Color(hex: label.color) ?? .secondary
    }

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 4) {
                Circle()
                    .fill(labelColor)
                    .frame(width: 10, height: 10)
                Text(label.name)
                    .font(.caption)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? labelColor.opacity(0.2) : IssueCTLColors.elevatedBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isSelected ? labelColor : IssueCTLColors.hairline, lineWidth: isSelected ? 1.5 : 0.5)
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityLabel("\(label.name) label")
    }
}

// FlowLayout is defined in IssueDetailView.swift and reused here.
