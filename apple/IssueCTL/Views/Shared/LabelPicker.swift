import SwiftUI

enum AutomationLabelKind {
    case issueAutoLaunch
    case prAutoReview

    var labelName: String {
        switch self {
        case .issueAutoLaunch:
            return "issuectl:auto-launch"
        case .prAutoReview:
            return "issuectl:auto-review"
        }
    }

    var title: String {
        switch self {
        case .issueAutoLaunch:
            return "Issue Auto-Launch"
        case .prAutoReview:
            return "PR Auto-Review"
        }
    }

    var appliedStatus: String {
        switch self {
        case .issueAutoLaunch:
            return "Auto-launch label applied"
        case .prAutoReview:
            return "Auto-review label applied"
        }
    }

    var missingStatus: String {
        switch self {
        case .issueAutoLaunch:
            return "Auto-launch label missing"
        case .prAutoReview:
            return "Auto-review label missing"
        }
    }

    var addButtonTitle: String {
        switch self {
        case .issueAutoLaunch:
            return "Add Auto-Launch Label"
        case .prAutoReview:
            return "Add Auto-Review Label"
        }
    }

    var removeButtonTitle: String {
        switch self {
        case .issueAutoLaunch:
            return "Remove Auto-Launch Label"
        case .prAutoReview:
            return "Remove Auto-Review Label"
        }
    }

    var systemImage: String {
        switch self {
        case .issueAutoLaunch:
            return "bolt.fill"
        case .prAutoReview:
            return "checkmark.shield.fill"
        }
    }
}

struct AutomationLabelStatusCard: View {
    let kind: AutomationLabelKind
    let isApplied: Bool
    let isAutomationEnabled: Bool
    let webhookSummary: String?
    let isToggling: Bool
    let buttonIdentifier: String
    let onToggle: () -> Void

    private var tint: Color {
        if isApplied && isAutomationEnabled {
            return .green
        }
        if isApplied || isAutomationEnabled {
            return IssueCTLColors.action
        }
        return .orange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: kind.systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 30, height: 30)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: IssueCTLColors.iconCornerRadius))

                VStack(alignment: .leading, spacing: 4) {
                    Text(kind.title)
                        .font(.subheadline.weight(.semibold))
                    Text(isApplied ? kind.appliedStatus : kind.missingStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(isAutomationEnabled ? "Repo automation enabled" : "Repo automation disabled")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let webhookSummary {
                        Text(webhookSummary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 0)
            }

            Button {
                onToggle()
            } label: {
                if isToggling {
                    HStack {
                        ProgressView()
                            .controlSize(.small)
                        Text("Updating")
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Label(isApplied ? kind.removeButtonTitle : kind.addButtonTitle, systemImage: "tag")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(tint)
            .disabled(isToggling)
            .accessibilityIdentifier(buttonIdentifier)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .contain)
    }
}

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
