import Capacitor
import UIKit

/// 앱 안에 들어 있는 MusicPlayer 플러그인을 등록하고, 테마에 맞춰 상태 표시줄 색을 바꾼다.
class MainViewController: CAPBridgeViewController {

    /// 어두운 테마면 흰 글씨 상태 표시줄을 쓴다.
    var lightContent = true

    override var preferredStatusBarStyle: UIStatusBarStyle {
        lightContent ? .lightContent : .darkContent
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MusicPlayerPlugin())
        view.backgroundColor = .black
        webView?.isOpaque = false
        webView?.backgroundColor = .black
        webView?.scrollView.backgroundColor = .black
        // 화면이 고무줄처럼 늘어나지 않게 한다. (안드로이드와 같은 느낌)
        webView?.scrollView.bounces = false
    }
}
