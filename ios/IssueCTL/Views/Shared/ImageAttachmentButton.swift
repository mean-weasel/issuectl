import PhotosUI
import SwiftUI
import UIKit

struct ImageAttachmentButton: View {
    @Environment(APIClient.self) private var api

    let owner: String
    let repo: String
    let onUpload: (String) -> Void

    @State private var selectedItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var errorMessage: String?

    @ViewBuilder
    private var pickerLabel: some View {
        if isUploading {
            ProgressView()
                .controlSize(.small)
        } else {
            Label("Attach Image", systemImage: "photo")
                .font(.callout)
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            PhotosPicker(
                selection: $selectedItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                pickerLabel
            }
            .disabled(isUploading)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
        }
        .onChange(of: selectedItem) { _, newItem in
            guard let newItem else { return }
            Task { await upload(item: newItem) }
            selectedItem = nil
        }
    }

    private func upload(item: PhotosPickerItem) async {
        isUploading = true
        errorMessage = nil

        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                errorMessage = "Could not load image"
                isUploading = false
                return
            }
            guard let uiImage = UIImage(data: data) else {
                errorMessage = "Invalid image data"
                isUploading = false
                return
            }

            let url = try await api.uploadImage(image: uiImage, owner: owner, repo: repo)
            let markdown = "![image](\(url))"
            onUpload(markdown)
        } catch {
            errorMessage = "Upload failed"
        }

        isUploading = false
    }
}
