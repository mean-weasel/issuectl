import SwiftUI

struct AddRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var owner = ""
    @State private var name = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    /// Called with the newly added repo on success.
    var onAdded: (Repo) -> Void

    private var isValid: Bool {
        !owner.trimmingCharacters(in: .whitespaces).isEmpty
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Owner", text: $owner)
                        .textContentType(.organizationName)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    TextField("Repository name", text: $name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("GitHub Repository")
                } footer: {
                    Text("Enter the owner and name exactly as they appear on GitHub (e.g. owner: \"apple\", name: \"swift\").")
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Add Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Add") {
                            Task { await submit() }
                        }
                        .disabled(!isValid)
                    }
                }
            }
            .interactiveDismissDisabled(isSubmitting)
        }
    }

    private func submit() async {
        let trimmedOwner = owner.trimmingCharacters(in: .whitespaces)
        let trimmedName = name.trimmingCharacters(in: .whitespaces)

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let repo = try await api.addRepo(owner: trimmedOwner, name: trimmedName)
            onAdded(repo)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
