import SwiftUI

protocol SectionTabItem: Hashable, CaseIterable, RawRepresentable where RawValue == String, AllCases: RandomAccessCollection {
    var icon: String { get }
}

struct SectionTabs<Section: SectionTabItem>: View {
    @Binding var selected: Section
    let counts: [Section: Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(Section.allCases), id: \.self) { section in
                    let count = counts[section] ?? 0
                    Button {
                        selected = section
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: section.icon)
                                .font(.caption)
                            Text(section.rawValue.capitalized)
                                .font(.subheadline.weight(selected == section ? .semibold : .regular))
                            Text("\(count)")
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(selected == section ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.15))
                                .clipShape(Capsule())
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(selected == section ? Color.accentColor.opacity(0.12) : Color.clear)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(selected == section ? .primary : .secondary)
                    .accessibilityIdentifier("section-tab-\(section.rawValue)")
                }
            }
            .padding(.horizontal)
        }
    }
}

enum IssueSection: String, CaseIterable, SectionTabItem {
    case drafts, open, running, unassigned, closed

    var icon: String {
        switch self {
        case .drafts: "doc.text"
        case .open: "circle"
        case .running: "play.circle"
        case .unassigned: "person.badge.minus"
        case .closed: "checkmark.circle"
        }
    }
}

enum PRSection: String, CaseIterable, SectionTabItem {
    case review, open, merged, closed

    var icon: String {
        switch self {
        case .review: "eye"
        case .open: "circle"
        case .merged: "arrow.triangle.merge"
        case .closed: "xmark.circle"
        }
    }
}

enum SortOrder: String, CaseIterable {
    case updated, created, priority
}
