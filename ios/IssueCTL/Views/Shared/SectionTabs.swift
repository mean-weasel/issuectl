import SwiftUI

struct SectionTabs<Section: Hashable & CaseIterable & RawRepresentable>: View where Section.AllCases: RandomAccessCollection, Section.RawValue == String {
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
                }
            }
            .padding(.horizontal)
        }
    }
}

enum IssueSection: String, CaseIterable {
    case drafts, open, running, closed
}

enum PRSection: String, CaseIterable {
    case open, closed
}

enum SortOrder: String, CaseIterable {
    case updated, created, priority
}
