import SwiftUI

struct CacheAgeLabel: View {
    let date: Date

    private static let formatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()

    private var timeAgo: String {
        Self.formatter.localizedString(for: date, relativeTo: Date())
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { _ in
            HStack(spacing: 4) {
                Image(systemName: "clock")
                    .font(.caption2)
                Text("Cached \(timeAgo)")
                    .font(.caption2)
            }
            .foregroundStyle(.tertiary)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}
