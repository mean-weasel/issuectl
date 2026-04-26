import SwiftUI

/// A fullscreen overlay that displays an image with pinch-to-zoom, double-tap to toggle zoom,
/// and swipe-to-dismiss.
///
/// ## Integration
///
/// To use `ImageLightbox` from any view that displays images:
///
/// ```swift
/// @State private var lightboxURL: URL?
///
/// // In your view body:
/// .fullScreenCover(item: $lightboxURL) { url in
///     ImageLightbox(url: url, isPresented: .init(
///         get: { lightboxURL != nil },
///         set: { if !$0 { lightboxURL = nil } }
///     ))
/// }
///
/// // When a user taps an image:
/// Button { lightboxURL = imageURL } label: { ... }
/// ```
///
/// Or with a simple `Bool` binding:
///
/// ```swift
/// @State private var showLightbox = false
/// let imageURL: URL = ...
///
/// .fullScreenCover(isPresented: $showLightbox) {
///     ImageLightbox(url: imageURL, isPresented: $showLightbox)
/// }
/// ```
struct ImageLightbox: View {
    let url: URL
    @Binding var isPresented: Bool

    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var dragOffset: CGSize = .zero

    private let minScale: CGFloat = 1.0
    private let maxScale: CGFloat = 5.0
    private let dismissThreshold: CGFloat = 150.0

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.ignoresSafeArea()
                    .opacity(dismissOpacity)

                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .tint(.white)
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .scaleEffect(scale)
                            .offset(combinedOffset)
                            .gesture(combinedGesture(in: geometry))
                            .onTapGesture(count: 2) {
                                withAnimation(.easeInOut(duration: 0.3)) {
                                    if scale > minScale {
                                        scale = minScale
                                        offset = .zero
                                        lastScale = minScale
                                        lastOffset = .zero
                                    } else {
                                        scale = 3.0
                                        lastScale = 3.0
                                    }
                                }
                            }
                    case .failure:
                        ContentUnavailableView {
                            Label("Failed to Load", systemImage: "photo.badge.exclamationmark")
                                .foregroundStyle(.white)
                        } description: {
                            Text("Could not load image")
                                .foregroundStyle(.white.opacity(0.7))
                        }
                    @unknown default:
                        EmptyView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .overlay(alignment: .topTrailing) {
                Button {
                    isPresented = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .white.opacity(0.3))
                }
                .padding(20)
                .opacity(dismissOpacity)
            }
        }
        .statusBarHidden()
    }

    // MARK: - Computed

    private var combinedOffset: CGSize {
        if scale <= minScale {
            // When not zoomed, only show drag offset (for swipe-to-dismiss)
            return dragOffset
        }
        return CGSize(
            width: offset.width + dragOffset.width,
            height: offset.height + dragOffset.height
        )
    }

    private var dismissOpacity: Double {
        if scale > minScale { return 1.0 }
        let progress = abs(dragOffset.height) / dismissThreshold
        return max(1.0 - progress * 0.5, 0.3)
    }

    // MARK: - Gestures

    private func combinedGesture(in geometry: GeometryProxy) -> some Gesture {
        SimultaneousGesture(
            magnificationGesture,
            dragGesture
        )
    }

    private var magnificationGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                let newScale = lastScale * value.magnification
                scale = min(max(newScale, minScale), maxScale)
            }
            .onEnded { value in
                let newScale = lastScale * value.magnification
                withAnimation(.easeOut(duration: 0.2)) {
                    scale = min(max(newScale, minScale), maxScale)
                    if scale <= minScale {
                        offset = .zero
                        lastOffset = .zero
                    }
                }
                lastScale = scale
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = value.translation
            }
            .onEnded { value in
                if scale <= minScale {
                    // Swipe-to-dismiss when not zoomed
                    if abs(value.translation.height) > dismissThreshold {
                        withAnimation(.easeOut(duration: 0.2)) {
                            dragOffset = CGSize(
                                width: value.translation.width,
                                height: value.translation.height > 0 ? 500 : -500
                            )
                        }
                        // Dismiss after animation starts
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            isPresented = false
                        }
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) {
                            dragOffset = .zero
                        }
                    }
                } else {
                    // Pan when zoomed
                    offset = CGSize(
                        width: lastOffset.width + value.translation.width,
                        height: lastOffset.height + value.translation.height
                    )
                    lastOffset = offset
                    dragOffset = .zero
                }
            }
    }
}
