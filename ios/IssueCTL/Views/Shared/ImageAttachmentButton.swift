import PhotosUI
import SwiftUI
import UIKit
import ImageIO

struct ImageAttachmentButton: View {
    @Environment(APIClient.self) private var api

    let owner: String
    let repo: String
    let onUpload: (String) -> Void

    @State private var selectedItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var errorMessage: String?

    var body: some View {
        let uploading = isUploading
        HStack(spacing: 8) {
            PhotosPicker(
                selection: $selectedItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                if uploading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Label("Attach Image", systemImage: "photo")
                        .font(.callout)
                }
            }
            .disabled(uploading)

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
            let imageData = try await ImageAttachmentProcessor.preparedJPEGData(from: data)
            let url = try await api.uploadImageData(imageData, owner: owner, repo: repo)
            let markdown = "![image](\(url))"
            onUpload(markdown)
        } catch ImageAttachmentProcessor.ProcessingError.invalidImage {
            errorMessage = "Invalid image data"
        } catch {
            errorMessage = "Upload failed"
        }

        isUploading = false
    }
}

enum ImageAttachmentProcessor {
    enum ProcessingError: Error {
        case invalidImage
    }

    private static let maxPixelSize = 1_600
    private static let compressionQuality: CGFloat = 0.8

    static func preparedJPEGData(from data: Data) async throws -> Data {
        try await Task.detached(priority: .userInitiated) {
            guard let imageSource = CGImageSourceCreateWithData(data as CFData, [
                kCGImageSourceShouldCache: false,
            ] as CFDictionary) else {
                throw ProcessingError.invalidImage
            }

            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            ]

            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
                throw ProcessingError.invalidImage
            }

            guard let jpegData = UIImage(cgImage: cgImage).jpegData(compressionQuality: compressionQuality) else {
                throw ProcessingError.invalidImage
            }

            return jpegData
        }.value
    }
}
