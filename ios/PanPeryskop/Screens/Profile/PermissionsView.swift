import SwiftUI

struct PermissionsView: View {
    var body: some View {
        ScrollView {
            PermissionCardsView(showsHeader: false)
                .padding(.top, 8)
        }
        .navigationTitle("Uprawnienia")
        .navigationBarTitleDisplayMode(.inline)
    }
}
