import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            MapScreen()

            VStack(spacing: 0) {
                Spacer()
                HStack(spacing: 40) {
                    Button(action: { selectedTab = 0 }) {
                        Image(systemName: "map.fill")
                            .font(.title3)
                            .foregroundColor(selectedTab == 0 ? .accentColor : .gray)
                    }

                    NavigationLink(destination: AddContentView()) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 44))
                            .foregroundColor(.accentColor)
                    }

                    Button(action: { selectedTab = 1 }) {
                        Image(systemName: "person.fill")
                            .font(.title3)
                            .foregroundColor(selectedTab == 1 ? .accentColor : .gray)
                    }
                }
                .padding(.horizontal, 40)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .padding(.bottom, 32)
            }

            if selectedTab == 1 {
                ProfileView(isPresented: $selectedTab)
                    .transition(.move(edge: .bottom))
                    .zIndex(10)
            }
        }
        .ignoresSafeArea(.keyboard)
    }
}
