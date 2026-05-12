import SwiftUI

struct MacSidebarRootView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.hideSidebar) private var hideSidebar

    @State private var selectedSection: MacSidebarSection = .issues
    @State private var serverURL = "http://localhost:3847"
    @State private var apiToken = ""
    @State private var isCheckingConnection = false
    @State private var connectionError: String?
    @State private var store = MacSidebarStore()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()

            if api.isConfigured {
                dashboard
            } else {
                connectionView
            }
        }
        .frame(minWidth: 340, idealWidth: 380, minHeight: 480)
        .background(Color(nsColor: .windowBackgroundColor))
        .onExitCommand {
            hideSidebar()
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "list.bullet.rectangle")
                .font(.title3.weight(.semibold))
            Text("IssueCTL")
                .font(.headline)
            Spacer()
            Button {
                hideSidebar()
            } label: {
                Image(systemName: "sidebar.right")
            }
            .buttonStyle(.borderless)
            .help("Hide Sidebar")

            if api.isConfigured {
                Button {
                    api.disconnect()
                    store.reset()
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
                .buttonStyle(.borderless)
                .help("Disconnect")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var dashboard: some View {
        VStack(spacing: 0) {
            dashboardToolbar
            Picker("Section", selection: $selectedSection) {
                ForEach(MacSidebarSection.allCases) { section in
                    Label(section.title, systemImage: section.systemImage)
                        .tag(section)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 14)
            .padding(.bottom, 10)

            Divider()

            Group {
                switch selectedSection {
                case .issues:
                    MacIssuesView(store: store)
                case .drafts:
                    MacDraftsView(store: store)
                case .active:
                    MacSessionsView(store: store)
                }
            }
        }
        .task {
            await store.load(api: api, refresh: false)
        }
    }

    private var dashboardToolbar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(selectedSection.title)
                    .font(.headline)
                Text(store.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task { await store.load(api: api, refresh: true) }
            } label: {
                if store.isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .buttonStyle(.borderless)
            .disabled(store.isLoading)
            .help("Refresh")
        }
        .padding(14)
    }

    private var connectionView: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Connect to issuectl web")
                    .font(.title3.weight(.semibold))
                Text("Start `issuectl web`, then use the API token printed by the server.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            TextField("Server URL", text: $serverURL)
                .textFieldStyle(.roundedBorder)

            SecureField("API token", text: $apiToken)
                .textFieldStyle(.roundedBorder)

            if let connectionError {
                Text(connectionError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await connect() }
            } label: {
                if isCheckingConnection {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Label("Connect", systemImage: "bolt.horizontal.circle")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isCheckingConnection || serverURL.isEmpty || apiToken.isEmpty)

            Spacer()
        }
        .padding(18)
    }

    private func connect() async {
        isCheckingConnection = true
        connectionError = nil
        defer { isCheckingConnection = false }

        do {
            _ = try await api.checkHealth(url: serverURL, token: apiToken)
            try api.configure(url: serverURL, token: apiToken)
            await store.load(api: api, refresh: true)
        } catch {
            connectionError = error.localizedDescription
        }
    }
}

private enum MacSidebarSection: String, CaseIterable, Identifiable {
    case issues
    case drafts
    case active

    var id: String { rawValue }

    var title: String {
        switch self {
        case .issues: "Issues"
        case .drafts: "Drafts"
        case .active: "Active"
        }
    }

    var systemImage: String {
        switch self {
        case .issues: "list.bullet"
        case .drafts: "doc.text"
        case .active: "terminal"
        }
    }
}
