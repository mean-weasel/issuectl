import SwiftUI

struct LaunchProgressView: View {
    let owner: String
    let repo: String
    let issueNumber: Int
    let branchName: String
    let agent: LaunchAgent

    @State private var currentStep = 0
    private var steps: [(label: String, detail: String)] {
        [
            ("Assembled issue context", "Gathering comments and referenced files"),
            ("Checked deployment history", "Verifying no conflicting sessions"),
            ("Checked out branch", ""),
            ("Applied lifecycle label", "Marking issue as in-progress"),
            ("\(agent.displayName) running", "Launching terminal session"),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(owner)/\(repo) #\(issueNumber)")
                .font(.headline)
                .padding(.bottom, 24)

            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    stepIndicator(for: index)
                        .frame(width: 24, height: 24)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.label)
                            .font(.subheadline.weight(index <= currentStep ? .medium : .regular))
                            .foregroundStyle(index <= currentStep ? .primary : .secondary)

                        if index == 2 {
                            Text(branchName)
                                .font(.caption.monospaced())
                                .foregroundStyle(.blue)
                        } else if !step.detail.isEmpty {
                            Text(step.detail)
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.bottom, index < steps.count - 1 ? 16 : 0)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .task {
            await animateSteps()
        }
    }

    @ViewBuilder
    private func stepIndicator(for index: Int) -> some View {
        if index < currentStep {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .transition(.scale.combined(with: .opacity))
        } else if index == currentStep {
            ProgressView()
                .scaleEffect(0.7)
                .transition(.opacity)
        } else {
            Circle()
                .strokeBorder(.quaternary, lineWidth: 1.5)
        }
    }

    private func animateSteps() async {
        for i in 0..<steps.count {
            withAnimation(.easeInOut(duration: 0.3)) {
                currentStep = i
            }
            if i < steps.count - 1 {
                do {
                    try await Task.sleep(for: .milliseconds(800))
                } catch {
                    return
                }
            }
        }
    }
}
