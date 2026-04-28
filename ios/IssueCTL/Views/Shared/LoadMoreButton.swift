import SwiftUI

struct LoadMoreButton: View {
    let totalCount: Int
    @Binding var displayLimit: Int
    let pageSize: Int

    var body: some View {
        if totalCount > displayLimit {
            Button {
                displayLimit += pageSize
            } label: {
                Text("Load More (\(totalCount - displayLimit) remaining)")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}
