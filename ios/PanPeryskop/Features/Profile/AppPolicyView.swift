import SwiftUI

/// "Polityka Aplikacji" — app data policy & sources. Reached from Settings as the
/// second-to-last item. Shows the app logo, a title and a plain (raw) list of
/// data sources + the OSM attribution required by the OSM/Nominatim usage policy.
/// The event-source list is fetched from the backend (/stories/sources) — the
/// backend is the single source of truth, never hardcoded on the client.
struct AppPolicyView: View {
    struct SourcesResponse: Codable {
        let sources: [String]
    }

    @State private var sources: [String] = []
    @State private var isLoading = true

    var body: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    Image("Logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 96, height: 96)
                    Text("Pan Peryskop")
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Wydarzenia i treści w Twoim mieście")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .listRowBackground(Color.clear)
            }

            Section("Dane geograficzne") {
                Label("© OpenStreetMap contributors", systemImage: "map.fill")
                Text("Dane geokodowania pochodzą z OpenStreetMap (Nominatim) i są udostępniane na licencji Open Database License (ODbL).")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section("Źródła wydarzeń") {
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                } else if sources.isEmpty {
                    Text("Brak źródeł")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(sources, id: \.self) { source in
                        Label(source, systemImage: "network")
                    }
                }
            }

            Section("Dokumenty") {
                Link("Polityka prywatności", destination: URL(string: "https://panperyskop.app/privacy")!)
                Link("Regulamin", destination: URL(string: "https://panperyskop.app/terms")!)
            }
        }
        .navigationTitle("Polityka Aplikacji")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadSources()
        }
    }

    private func loadSources() async {
        do {
            let resp: SourcesResponse = try await APIClient.get("/stories/sources")
            sources = resp.sources
        } catch {
            sources = []
        }
        isLoading = false
    }
}
