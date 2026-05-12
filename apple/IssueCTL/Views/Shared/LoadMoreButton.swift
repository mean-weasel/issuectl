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
                Text("Show More (\(totalCount - displayLimit))")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}
