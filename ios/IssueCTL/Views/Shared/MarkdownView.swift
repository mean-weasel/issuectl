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
        let blocks = splitCodeBlocks(content)
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
                    markdownText(block.text)
                        .textSelection(.enabled)
                }
            }
        }
    }

    // MARK: - Inline Markdown

    private func parseMarkdown(_ source: String) -> AttributedString? {
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

    @ViewBuilder
    private func markdownText(_ source: String) -> some View {
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            EmptyView()
        } else if let attributed = parseMarkdown(trimmed) {
            Text(attributed)
                .font(.body)
        } else {
            Text(trimmed)
                .font(.body)
        }
    }

    // MARK: - Code Block Splitting

    /// Splits markdown into alternating prose / fenced-code-block segments.
    private func splitCodeBlocks(_ source: String) -> [Block] {
        var blocks: [Block] = []
        var current = ""
        var insideCode = false
        let lines = source.components(separatedBy: "\n")

        for line in lines {
            if line.hasPrefix("```") {
                if insideCode {
                    // Closing fence — finish the code block
                    blocks.append(Block(text: current, isCode: true))
                    current = ""
                    insideCode = false
                } else {
                    // Opening fence — flush any prose before it
                    let prose = current.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !prose.isEmpty {
                        blocks.append(Block(text: prose, isCode: false))
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
            blocks.append(Block(text: remaining, isCode: insideCode))
        }

        return blocks
    }
}

private struct Block {
    let text: String
    let isCode: Bool
}
