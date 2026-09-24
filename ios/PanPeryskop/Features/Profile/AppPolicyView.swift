import SwiftUI

struct AppPolicyView: View {
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
                    Text("Wydarzenia w Twoim mieście")
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

            Section("Zdjęcia miast") {
                Label("© Wikimedia Commons contributors", systemImage: "photo")
                Text("Zdjęcia miast pochodzą z Wikimedia Commons i są udostępniane na licencjach Creative Commons (CC BY / CC BY-SA). Źródło każdego zdjęcia jest zapisane przy mieście.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Label("© Unsplash", systemImage: "photo.on.rectangle")
                Text("Zdjęcia miast pochodzą także z Unsplash (unsplash.com) i są używane na licencji Unsplash. Autor zdjęcia jest podany przy zdjęciu.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section("Dokumenty") {
                Link("Polityka prywatności", destination: URL(string: "https://panperyskop.app/privacy")!)
                Link("Regulamin", destination: URL(string: "https://panperyskop.app/terms")!)
            }
        }
        .navigationTitle("Polityka Aplikacji")
        .navigationBarTitleDisplayMode(.inline)
    }
}
