import SwiftUI
import UIKit

/// Disables the interactive pop gesture recognizer on the enclosing
/// UINavigationController when the NavigationStack is at its root view.
/// This prevents the edge-swipe-back gesture from triggering on the root
/// screen — where there is nothing to pop — which otherwise causes visual
/// corruption or a blank screen when it conflicts with List swipe actions
/// inside a TabView.
///
/// Uses a UIViewControllerRepresentable that walks the parent VC chain
/// after being added to the hierarchy, since SwiftUI's NavigationStack
/// wraps its content in intermediate hosting controllers. The gesture
/// state is re-evaluated on each appearance lifecycle event and whenever
/// `isAtRoot` changes.
struct InteractivePopDisabler: UIViewControllerRepresentable {
    let isAtRoot: Bool

    func makeUIViewController(context: Context) -> DisablerViewController {
        DisablerViewController()
    }

    func updateUIViewController(_ vc: DisablerViewController, context: Context) {
        vc.isAtRoot = isAtRoot
    }

    final class DisablerViewController: UIViewController {
        fileprivate(set) var isAtRoot = true {
            didSet { updateGestureDeferred() }
        }

        private weak var trackedNavController: UINavigationController?

        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            updateGestureDeferred()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            updateGestureDeferred()
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            // Re-enable on teardown so we never strand the gesture in a disabled state
            trackedNavController?.interactivePopGestureRecognizer?.isEnabled = true
        }

        deinit {
            // Safety net: if viewWillDisappear didn't fire (e.g., removed from parent
            // without the standard lifecycle), re-enable via the tracked reference.
            // Dispatch to main thread since deinit may run off-main in Swift 6.
            let nav = trackedNavController
            DispatchQueue.main.async {
                nav?.interactivePopGestureRecognizer?.isEnabled = true
            }
        }

        private func updateGestureDeferred() {
            // Defer to the next run-loop tick because UIKit lifecycle callbacks
            // can fire before SwiftUI's hosting controllers are fully inserted
            // into the navigation hierarchy.
            DispatchQueue.main.async { [weak self] in
                self?.updateGesture()
            }
        }

        private func updateGesture() {
            // Walk the parent VC chain, checking both the direct type cast and
            // the .navigationController property at each level.
            var current: UIViewController? = self
            while let vc = current {
                let nav = (vc as? UINavigationController) ?? vc.navigationController
                if let nav {
                    trackedNavController = nav
                    // Enable the pop gesture only when NOT at root (there's somewhere to go back to)
                    nav.interactivePopGestureRecognizer?.isEnabled = !isAtRoot
                    return
                }
                current = vc.parent
            }
            #if DEBUG
            print("[InteractivePopDisabler] No UINavigationController found in parent chain")
            #endif
        }
    }
}

extension View {
    /// Disables the iOS interactive pop gesture when the navigation stack is at root.
    func interactivePopDisabled(isAtRoot: Bool) -> some View {
        background(InteractivePopDisabler(isAtRoot: isAtRoot))
    }
}
