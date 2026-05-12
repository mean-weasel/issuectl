import SwiftUI

/// Renders a markdown string as styled `Text` using `AttributedString(markdown:)`.
///
/// Inline elements (bold, italic, inline code, links) are rendered via
/// `.inlineOnlyPreservingWhitespace`. Fenced code blocks (```) are extracted
/// and displayed in a monospace font with a background. Block-level markdown
/// (headings, lists, blockquotes) is **not** interpreted.
/// If markdown parsing fails, the raw string is shown as a fallback.
struct MarkdownView: View {
    let content: String

    var body: some View {
        let blocks = MarkdownRenderCache.shared.blocks(for: content)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                if block.isCode {
                    Text(block.text)
                        .font(.body.monospaced())
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(IssueCTLColors.elevatedBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay {
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
                        }
                        .textSelection(.enabled)
                } else {
                    markdownText(block)
                        .textSelection(.enabled)
                }
            }
        }
    }

    // MARK: - Inline Markdown

    @ViewBuilder
    private func markdownText(_ block: MarkdownBlock) -> some View {
        if block.text.isEmpty {
            EmptyView()
        } else if let attributed = block.attributedText {
            Text(attributed)
                .font(.body)
        } else {
            Text(block.text)
                .font(.body)
        }
    }
}

private final class MarkdownRenderCache {
    nonisolated(unsafe) static let shared = MarkdownRenderCache()

    private let cache = NSCache<NSString, MarkdownRenderStorage>()

    func blocks(for content: String) -> [MarkdownBlock] {
        let key = content as NSString
        if let cached = cache.object(forKey: key) {
            return cached.blocks
        }

        let blocks = MarkdownParser.blocks(from: content)
        cache.setObject(MarkdownRenderStorage(blocks: blocks), forKey: key)
        return blocks
    }
}

private final class MarkdownRenderStorage {
    let blocks: [MarkdownBlock]

    init(blocks: [MarkdownBlock]) {
        self.blocks = blocks
    }
}

private enum MarkdownParser {
    static func blocks(from source: String) -> [MarkdownBlock] {
        splitCodeBlocks(source).map { block in
            guard !block.isCode else { return block }
            return MarkdownBlock(
                text: block.text,
                isCode: false,
                attributedText: parseMarkdown(block.text)
            )
        }
    }

    // MARK: - Code Block Splitting

    /// Splits markdown into alternating prose / fenced-code-block segments.
    private static func splitCodeBlocks(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var current = ""
        var insideCode = false
        let lines = source.components(separatedBy: "\n")

        for line in lines {
            if line.hasPrefix("```") {
                if insideCode {
                    // Closing fence — finish the code block
                    blocks.append(MarkdownBlock(text: current, isCode: true))
                    current = ""
                    insideCode = false
                } else {
                    // Opening fence — flush any prose before it
                    let prose = current.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !prose.isEmpty {
                        blocks.append(MarkdownBlock(text: prose, isCode: false))
                    }
                    current = ""
                    insideCode = true
                }
            } else {
                current += current.isEmpty ? line : "\n" + line
            }
        }

        // Handle any remaining text
        let remaining = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !remaining.isEmpty {
            blocks.append(MarkdownBlock(text: remaining, isCode: insideCode))
        }

        return blocks
    }

    private static func parseMarkdown(_ source: String) -> AttributedString? {
        do {
            return try AttributedString(
                markdown: source,
                options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
            )
        } catch {
            #if DEBUG
            print("[MarkdownView] Parse failed: \(error.localizedDescription)")
            #endif
            return nil
        }
    }
}

private struct MarkdownBlock {
    let text: String
    let isCode: Bool
    let attributedText: AttributedString?

    init(text: String, isCode: Bool, attributedText: AttributedString? = nil) {
        self.text = text
        self.isCode = isCode
        self.attributedText = attributedText
    }
}
