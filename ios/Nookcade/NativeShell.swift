import UIKit

private enum Palette {
    static let background = UIColor(red: 0.961, green: 0.965, blue: 0.98, alpha: 1)
    static let ink = UIColor(red: 0.125, green: 0.149, blue: 0.212, alpha: 1)
    static let secondary = UIColor(red: 0.392, green: 0.439, blue: 0.529, alpha: 1)
    static let accent = UIColor(red: 0.294, green: 0.369, blue: 0.796, alpha: 1)
}

/// Construct complete native tab models only after the persisted locale is known.
/// Never attach empty tab items and mutate their icon/title after the first layout.
final class NativeShell: UIViewController, UITabBarControllerDelegate {
    let host: GameHost
    private(set) var tabs: UITabBarController?
    private lazy var games = CatalogView(host: host, favoritesOnly: false)
    private lazy var favorites = CatalogView(host: host, favoritesOnly: true)
    private lazy var settings = SettingsView(host: host)
    private let resident = UIView(), gameSurface = UIView(), loading = UILabel()
    private var gameVisible = false
    private var tabLocale = ""
    private var synchronizedTab = ""
    init(host: GameHost) { self.host = host; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown }
    override var prefersStatusBarHidden: Bool { gameVisible }
    override var prefersHomeIndicatorAutoHidden: Bool { gameVisible }
    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
    override func viewDidLoad() {
        super.viewDidLoad(); overrideUserInterfaceStyle = .light
        view.backgroundColor = Palette.background; view.tintColor = Palette.accent
        view.addSubview(resident); resident.frame = CGRect(x: 0, y: 0, width: 1, height: 1); resident.alpha = 0.01; resident.isUserInteractionEnabled = false; resident.accessibilityElementsHidden = true
        resident.addSubview(host.webView); host.webView.frame = resident.bounds
        gameSurface.backgroundColor = Palette.background; gameSurface.isHidden = true
        view.addSubview(gameSurface); gameSurface.translatesAutoresizingMaskIntoConstraints = false
        // The game surface fills the display; each game's web UI owns safe-area
        // padding for controls, so UIKit must not inset the whole background.
        NSLayoutConstraint.activate([gameSurface.leadingAnchor.constraint(equalTo: view.leadingAnchor), gameSurface.trailingAnchor.constraint(equalTo: view.trailingAnchor), gameSurface.topAnchor.constraint(equalTo: view.topAnchor), gameSurface.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        loading.text = "Nookcade"; loading.textColor = Palette.secondary; loading.textAlignment = .center; loading.accessibilityIdentifier = "native-loading"
        view.addSubview(loading); loading.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([loading.centerXAnchor.constraint(equalTo: view.centerXAnchor), loading.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        host.presenter = self
        host.onCatalog = { [weak self] state in self?.update(state) }
        host.onError = { [weak self] message in self?.loading.text = message; self?.loading.numberOfLines = 0; self?.loading.isHidden = false }
    }
    private var labels: [String] { [host.label("玩吧"), host.label("我的"), host.label("设置")] }
    private func installTabs() {
        let controller = UITabBarController(); controller.delegate = self
        let symbols = ["gamecontroller", "heart", "gearshape"], identifiers = ["native-games-tab", "native-my-tab", "native-settings-tab"]
        let pages: [UIViewController] = [games, favorites, settings]
        let navigation = pages.map { page in let nav = UINavigationController(rootViewController: page); nav.navigationBar.prefersLargeTitles = true; return nav }
        if #available(iOS 18.0, *) {
            controller.tabs = navigation.enumerated().map { index, nav in
                let tab = UITab(title: labels[index], image: UIImage(systemName: symbols[index]), identifier: identifiers[index]) { _ in nav }
                tab.accessibilityIdentifier = identifiers[index]; tab.preferredPlacement = .fixed
                return tab
            }
        } else {
            for (index, nav) in navigation.enumerated() {
                nav.tabBarItem = UITabBarItem(title: labels[index], image: UIImage(systemName: symbols[index]), tag: index)
                nav.tabBarItem.accessibilityIdentifier = identifiers[index]
            }
            controller.viewControllers = navigation
        }
        // No appearance offsets, custom fonts, blur replacement or manual item frames.
        // Normal/selected/inline/compact states use the same system defaults.
        addChild(controller); view.insertSubview(controller.view, at: 0); controller.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor), controller.view.topAnchor.constraint(equalTo: view.topAnchor), controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        controller.didMove(toParent: self); tabs = controller; tabLocale = host.locale
    }
    private func update(_ state: [String: Any]) {
        guard host.ready else { return }
        if tabs == nil { installTabs() }
        guard let tabs else { return }
        if tabLocale != host.locale {
            if #available(iOS 18.0, *) { for (index, tab) in tabs.tabs.enumerated() { tab.title = labels[index] } }
            else { for (index, nav) in (tabs.viewControllers ?? []).enumerated() { nav.tabBarItem.title = labels[index] } }
            tabLocale = host.locale
        }
        games.reload(); favorites.reload(); settings.reload(); loading.isHidden = true
        let show = state["game"] as? String != nil
        if show != gameVisible {
            gameVisible = show; gameSurface.isHidden = !show; tabs.view.isHidden = show
            host.webView.removeFromSuperview()
            if show { gameSurface.addSubview(host.webView); host.webView.frame = gameSurface.bounds; host.webView.autoresizingMask = [.flexibleWidth, .flexibleHeight] }
            else { resident.addSubview(host.webView); host.webView.frame = resident.bounds }
            setNeedsUpdateOfHomeIndicatorAutoHidden(); setNeedsStatusBarAppearanceUpdate(); view.setNeedsLayout(); view.layoutIfNeeded()
        }
        if !show, let tab = state["tab"] as? String, tab != synchronizedTab {
            // Repeated catalog refreshes must not reset the system's in-flight
            // glass drag preview. Apply only an actual shared navigation change.
            let index = tab == "settings" ? 2 : tab == "my" ? 1 : 0
            synchronizedTab = tab
            if #available(iOS 18.0, *) {
                if tabs.selectedTab !== tabs.tabs[index] { tabs.selectedTab = tabs.tabs[index] }
            } else if tabs.selectedIndex != index { tabs.selectedIndex = index }
        }
    }
    private func selected(_ index: Int) {
        let tab = index == 2 ? "settings" : index == 1 ? "my" : games.mode
        if host.catalog["game"] as? String == nil, host.catalog["tab"] as? String == tab { return }
        host.call("openShellTab", [tab])
    }
    @available(iOS 18.0, *)
    func tabBarController(_ tabBarController: UITabBarController, didSelectTab selectedTab: UITab, previousTab: UITab?) {
        if let index = tabBarController.tabs.firstIndex(where: { $0 === selectedTab }) { selected(index) }
    }
    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        if #available(iOS 18.0, *) { return }; selected(tabBarController.selectedIndex)
    }
}

private final class IconStore {
    static let shared = IconStore()
    private let images = NSCache<NSString, UIImage>()
    private let sheets = NSCache<NSString, UIImage>()
    private let decoding = DispatchQueue(label: "Nookcade.icon-decoding", qos: .userInitiated)
    private var pending: [String: [(UIImage?) -> Void]] = [:] // main-thread ownership
    private let scale = min(3, UIScreen.main.scale)
    init() { images.totalCostLimit = 8 * 1024 * 1024; sheets.countLimit = 2; sheets.totalCostLimit = 16 * 1024 * 1024 }
    func load(_ game: [String: Any], root: URL, completion: @escaping (UIImage?) -> Void) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard let id = game["id"] as? String else { completion(nil); return }
        if let cached = images.object(forKey: id as NSString) { completion(cached); return }
        if pending[id] != nil { pending[id]?.append(completion); return }
        pending[id] = [completion]
        decoding.async { [weak self] in
            guard let self else { return }
            let result = autoreleasepool { self.decode(game, root: root) }
            if let result { self.images.setObject(result, forKey: id as NSString, cost: Int(68 * 68 * self.scale * self.scale * 4)) }
            DispatchQueue.main.async { let callbacks = self.pending.removeValue(forKey: id) ?? []; callbacks.forEach { $0(result) } }
        }
    }
    private func decode(_ game: [String: Any], root: URL) -> UIImage? {
        guard let icon = game["icon"] as? [String: Any], let path = icon["path"] as? String, path.hasPrefix("assets/game-art/"), !path.contains(".."), let rect = icon["sourceRect"] as? [Double], rect.count == 4 else { return nil }
        let sheet = sheets.object(forKey: path as NSString) ?? UIImage(contentsOfFile: root.appendingPathComponent(path).path)
        guard let sheet, let cg = sheet.cgImage else { return nil }; sheets.setObject(sheet, forKey: path as NSString, cost: cg.width * cg.height * 4)
        let bounds = CGRect(x: rect[0], y: rect[1], width: rect[2], height: rect[3])
        guard CGRect(x: 0, y: 0, width: cg.width, height: cg.height).contains(bounds), let cropped = cg.cropping(to: bounds) else { return nil }
        let format = UIGraphicsImageRendererFormat(); format.scale = scale
        let result = UIGraphicsImageRenderer(size: CGSize(width: 68, height: 68), format: format).image { _ in UIImage(cgImage: cropped).draw(in: CGRect(x: 0, y: 0, width: 68, height: 68)) }
        return result
    }
}

private final class GameCell: UICollectionViewCell {
    let icon = UIImageView(), name = UILabel(), score = UILabel(), favorite = UIButton(type: .system)
    var toggle: (() -> Void)?
    let launchButton = UIButton(type: .custom)
    var launch: (() -> Void)?
    var representedGameID = ""
    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.backgroundColor = .white; contentView.layer.cornerRadius = 18
        icon.contentMode = .scaleAspectFill; icon.layer.cornerRadius = 15; icon.clipsToBounds = true
        name.font = .preferredFont(forTextStyle: .headline); name.textColor = Palette.ink; name.numberOfLines = 2; name.adjustsFontForContentSizeCategory = true
        score.font = .preferredFont(forTextStyle: .caption1); score.textColor = Palette.secondary; score.numberOfLines = 2; score.adjustsFontForContentSizeCategory = true
        favorite.tintColor = Palette.accent; favorite.addTarget(self, action: #selector(toggleFavorite), for: .touchUpInside)
        launchButton.addTarget(self, action: #selector(launchGame), for: .touchUpInside)
        [icon, name, score, favorite].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; contentView.addSubview($0) }
        NSLayoutConstraint.activate([icon.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 14), icon.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 14), icon.widthAnchor.constraint(equalToConstant: 68), icon.heightAnchor.constraint(equalToConstant: 68), favorite.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -4), favorite.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 6), favorite.widthAnchor.constraint(equalToConstant: 44), favorite.heightAnchor.constraint(equalToConstant: 44), name.topAnchor.constraint(equalTo: icon.bottomAnchor, constant: 12), name.leadingAnchor.constraint(equalTo: icon.leadingAnchor), name.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -12), score.topAnchor.constraint(equalTo: name.bottomAnchor, constant: 6), score.leadingAnchor.constraint(equalTo: name.leadingAnchor), score.trailingAnchor.constraint(equalTo: name.trailingAnchor), score.bottomAnchor.constraint(lessThanOrEqualTo: contentView.bottomAnchor, constant: -12)])
        launchButton.translatesAutoresizingMaskIntoConstraints = false; contentView.addSubview(launchButton)
        NSLayoutConstraint.activate([launchButton.leadingAnchor.constraint(equalTo: contentView.leadingAnchor), launchButton.trailingAnchor.constraint(equalTo: contentView.trailingAnchor), launchButton.topAnchor.constraint(equalTo: contentView.topAnchor), launchButton.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)])
        contentView.bringSubviewToFront(favorite); name.isAccessibilityElement = false; score.isAccessibilityElement = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func launchGame() { launch?() }
    @objc private func toggleFavorite() { toggle?() }
}

private final class CatalogView: UIViewController, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout, UICollectionViewDragDelegate, UICollectionViewDropDelegate {
    let host: GameHost, favoritesOnly: Bool
    var mode = "single"
    private var displayed: [[String: Any]] = []
    private let segment = UISegmentedControl(items: ["", ""])
    private let empty = UILabel()
    private let refresh = UIRefreshControl()
    private var layoutWidth: CGFloat = 0
    private lazy var collection = UICollectionView(frame: .zero, collectionViewLayout: UICollectionViewFlowLayout())
    init(host: GameHost, favoritesOnly: Bool) { self.host = host; self.favoritesOnly = favoritesOnly; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = Palette.background
        segment.selectedSegmentIndex = 0; segment.addTarget(self, action: #selector(changeMode), for: .valueChanged); segment.accessibilityIdentifier = "native-mode"
        collection.backgroundColor = Palette.background; collection.delegate = self; collection.dataSource = self; collection.register(GameCell.self, forCellWithReuseIdentifier: "game"); collection.accessibilityIdentifier = favoritesOnly ? "native-favorites" : "native-catalog"
        collection.dragDelegate = self; collection.dropDelegate = self; collection.dragInteractionEnabled = true
        collection.alwaysBounceVertical = true; collection.refreshControl = refresh; refresh.addTarget(self, action: #selector(refreshCatalog), for: .valueChanged)
        empty.numberOfLines = 0; empty.textAlignment = .center; empty.textColor = Palette.secondary; empty.font = .preferredFont(forTextStyle: .body)
        [segment, collection, empty].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; view.addSubview($0) }; segment.isHidden = favoritesOnly
        NSLayoutConstraint.activate([segment.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20), segment.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20), segment.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8), segment.heightAnchor.constraint(equalToConstant: favoritesOnly ? 0 : 36), collection.topAnchor.constraint(equalTo: segment.bottomAnchor, constant: 12), collection.leadingAnchor.constraint(equalTo: view.leadingAnchor), collection.trailingAnchor.constraint(equalTo: view.trailingAnchor), collection.bottomAnchor.constraint(equalTo: view.bottomAnchor), empty.centerYAnchor.constraint(equalTo: collection.centerYAnchor), empty.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30), empty.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30)])
        reload()
    }
    var preferences: [String: [String]] { host.catalog["preferences"] as? [String: [String]] ?? ["favorites": [], "order": []] }
    func reload() {
        guard isViewLoaded else { return }
        navigationItem.title = host.label(favoritesOnly ? "我的收藏" : "玩吧")
        segment.setTitle(host.label("单人游戏"), forSegmentAt: 0); segment.setTitle(host.label("人机挑战"), forSegmentAt: 1)
        if !favoritesOnly, let tab = host.catalog["tab"] as? String, ["single", "double"].contains(tab) { mode = tab; segment.selectedSegmentIndex = tab == "double" ? 1 : 0 }
        let all = host.catalog["games"] as? [[String: Any]] ?? []
        let order = preferences["order"] ?? []; let favorites = preferences["favorites"] ?? []
        displayed = all.filter { item in favoritesOnly ? favorites.contains(item["id"] as? String ?? "") : item["mode"] as? String == mode }
            .sorted { (order.firstIndex(of: $0["id"] as? String ?? "") ?? 99) < (order.firstIndex(of: $1["id"] as? String ?? "") ?? 99) }
        empty.text = host.label("还没有收藏的游戏") + "\n\n" + host.label("在游戏列表点收藏，即可在这里找到。")
        empty.isHidden = !favoritesOnly || !displayed.isEmpty; collection.reloadData()
    }
    @objc private func changeMode() { mode = segment.selectedSegmentIndex == 1 ? "double" : "single"; host.call("openShellTab", [mode]) }
    @objc private func refreshCatalog() { host.refresh { [weak self] _ in self?.refresh.endRefreshing() } }
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int { displayed.count }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "game", for: indexPath) as! GameCell
        let game = displayed[indexPath.item], id = game["id"] as? String ?? ""
        cell.name.text = game["name"] as? String; cell.score.text = game["score"] as? String; cell.representedGameID = id; cell.icon.image = nil
        IconStore.shared.load(game, root: host.root) { [weak cell] image in if cell?.representedGameID == id { cell?.icon.image = image } }
        let selected = preferences["favorites"]?.contains(id) == true
        cell.favorite.setImage(UIImage(systemName: selected ? "heart.fill" : "heart"), for: .normal)
        cell.favorite.accessibilityLabel = host.label(selected ? "取消收藏" : "收藏游戏") + " " + (game["name"] as? String ?? "")
        cell.favorite.accessibilityIdentifier = "favorite-\(id)"; cell.accessibilityIdentifier = "game-\(id)"
        cell.launchButton.accessibilityLabel = (cell.name.text ?? "") + ". " + (cell.score.text ?? "")
        cell.launchButton.accessibilityIdentifier = "launch-\(id)"
        cell.launch = { [weak self] in guard let self else { return }; self.host.call("launch", [id, self.favoritesOnly ? "my" : self.mode]) }
        cell.toggle = { [weak self] in self?.host.mutateCatalog { original in var prefs = original; var values = prefs["favorites"] ?? []; if values.contains(id) { values.removeAll { $0 == id } } else { values.append(id) }; prefs["favorites"] = values; return prefs } }
        return cell
    }
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) { host.call("launch", [displayed[indexPath.item]["id"] as? String ?? "", favoritesOnly ? "my" : mode]) }
    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let columns: CGFloat = view.bounds.width >= 700 ? 4 : 2
        return CGSize(width: floor((view.bounds.width - 40 - (columns - 1) * 12) / columns), height: traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? 244 : 194)
    }
    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, insetForSectionAt section: Int) -> UIEdgeInsets { UIEdgeInsets(top: 0, left: 20, bottom: 24, right: 20) }
    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, minimumLineSpacingForSectionAt section: Int) -> CGFloat { 12 }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if abs(layoutWidth - collection.bounds.width) > 0.5 { layoutWidth = collection.bounds.width; collection.collectionViewLayout.invalidateLayout() }
    }
    func collectionView(_ collectionView: UICollectionView, contextMenuConfigurationForItemAt indexPath: IndexPath, point: CGPoint) -> UIContextMenuConfiguration? {
        let id = displayed[indexPath.item]["id"] as? String ?? ""
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
            guard let self else { return nil }
            return UIMenu(title: self.host.label("自定义排序"), children: [-1, 1].map { direction in
                UIAction(title: self.host.label(direction < 0 ? "上移" : "下移"), image: UIImage(systemName: direction < 0 ? "arrow.up" : "arrow.down")) { _ in
                    let ids = self.displayed.compactMap { $0["id"] as? String }
                    self.host.mutateCatalog { original in
                        var prefs = original; var order = prefs["order"] ?? []
                        guard let index = ids.firstIndex(of: id), ids.indices.contains(index + direction), let first = order.firstIndex(of: id), let second = order.firstIndex(of: ids[index + direction]) else { return prefs }
                        order.swapAt(first, second); prefs["order"] = order; return prefs
                    }
                }
            })
        }
    }
    func collectionView(_ collectionView: UICollectionView, itemsForBeginning session: UIDragSession, at indexPath: IndexPath) -> [UIDragItem] {
        guard let id = displayed[indexPath.item]["id"] as? String else { return [] }
        let item = UIDragItem(itemProvider: NSItemProvider(object: id as NSString)); item.localObject = id; return [item]
    }
    func collectionView(_ collectionView: UICollectionView, dropSessionDidUpdate session: UIDropSession, withDestinationIndexPath destinationIndexPath: IndexPath?) -> UICollectionViewDropProposal {
        UICollectionViewDropProposal(operation: session.localDragSession != nil ? .move : .forbidden, intent: .insertAtDestinationIndexPath)
    }
    func collectionView(_ collectionView: UICollectionView, performDropWith coordinator: UICollectionViewDropCoordinator) {
        guard let item = coordinator.items.first, let source = item.sourceIndexPath, let id = item.dragItem.localObject as? String, displayed.indices.contains(source.item), displayed[source.item]["id"] as? String == id else { return }
        let destination = min(coordinator.destinationIndexPath?.item ?? displayed.count - 1, displayed.count - 1)
        let moved = displayed.remove(at: source.item); displayed.insert(moved, at: destination)
        collectionView.performBatchUpdates { collectionView.moveItem(at: source, to: IndexPath(item: destination, section: 0)) }
        coordinator.drop(item.dragItem, toItemAt: IndexPath(item: destination, section: 0))
        let ids = displayed.compactMap { $0["id"] as? String }; let visible = Set(ids)
        host.mutateCatalog { original in
            var prefs = original; var next = ids.makeIterator()
            prefs["order"] = (prefs["order"] ?? []).map { visible.contains($0) ? next.next()! : $0 }; return prefs
        }
    }
}

private final class SettingsView: UITableViewController {
    let host: GameHost
    init(host: GameHost) { self.host = host; super.init(style: .insetGrouped) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() { super.viewDidLoad(); tableView.backgroundColor = Palette.background; tableView.accessibilityIdentifier = "native-settings"; reload() }
    func reload() { guard isViewLoaded else { return }; navigationItem.title = host.label("设置"); tableView.reloadData() }
    override func numberOfSections(in tableView: UITableView) -> Int { 3 }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { [3, 2, 2][section] }
    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? { host.label(["偏好设置", "游戏备份", "关于玩吧"][section]) }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? { section == 0 ? host.label("游戏进度会自动保存到本机。返回游戏时可选择继续；此开关只控制打开应用后的页面。") : section == 1 ? host.label("备份包含游戏进度、历史记录、收藏和排序。换机前请先导出；导入也支持玩伴小屋的旧版游戏备份。") : host.label("数据保存在当前设备，卸载应用会删除本机存档。") }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil); cell.textLabel?.numberOfLines = 0; cell.textLabel?.textColor = Palette.ink; cell.detailTextLabel?.textColor = Palette.secondary; cell.detailTextLabel?.numberOfLines = 0
        let keys = [["界面语言", "性能与画质", "下次打开时回到上次游戏"], ["导出备份", "导入备份"], ["关于玩吧", "查看许可证"]]
        cell.textLabel?.text = host.label(keys[indexPath.section][indexPath.row]); cell.accessibilityIdentifier = "setting-\(indexPath.section)-\(indexPath.row)"
        if indexPath.section == 0 {
            if indexPath.row == 0 { cell.detailTextLabel?.text = (host.catalog["locales"] as? [[String: String]])?.first { $0["id"] == host.locale }?["name"]; cell.accessoryType = .disclosureIndicator }
            if indexPath.row == 1 { let mode = host.catalog["performance"] as? String ?? "normal"; cell.detailTextLabel?.text = host.label(mode == "eco" ? "省电" : mode == "game" ? "游戏" : "普通"); cell.accessoryType = .disclosureIndicator }
            if indexPath.row == 2 { let toggle = UISwitch(); toggle.isOn = host.catalog["rememberWindow"] as? Bool ?? false; toggle.addTarget(self, action: #selector(remember(_:)), for: .valueChanged); toggle.accessibilityLabel = cell.textLabel?.text; toggle.accessibilityIdentifier = "native-remember"; cell.accessoryView = toggle; cell.selectionStyle = .none }
        }
        if indexPath.section == 2 && indexPath.row == 0 { cell.detailTextLabel?.text = "Nookcade \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "")\niOS \(UIDevice.current.systemVersion) · WKWebView\n" + host.label("游戏内容") + ": " + host.native("bundled"); cell.selectionStyle = .none }
        if !(indexPath.section == 0 && indexPath.row == 2) {
            cell.isAccessibilityElement = true; cell.accessibilityLabel = [cell.textLabel?.text, cell.detailTextLabel?.text].compactMap { $0 }.joined(separator: ". ")
            cell.accessibilityTraits = indexPath.section == 2 && indexPath.row == 0 ? .staticText : .button
        }
        return cell
    }
    @objc private func remember(_ sender: UISwitch) { host.call("setRememberWindow", [sender.isOn]) }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        if indexPath.section == 0 && indexPath.row < 2 {
            let language = indexPath.row == 0
            let choices = language ? (host.catalog["locales"] as? [[String: String]] ?? []).map { ($0["id"] ?? "", $0["name"] ?? "") } : [("eco", host.label("省电")), ("normal", host.label("普通")), ("game", host.label("游戏"))]
            let sheet = UIAlertController(title: host.label(language ? "界面语言" : "性能与画质"), message: nil, preferredStyle: .actionSheet)
            for (id, name) in choices { sheet.addAction(UIAlertAction(title: name, style: .default) { _ in self.host.call(language ? "setLocale" : "setPerformance", [id]) }) }
            sheet.addAction(UIAlertAction(title: host.label("取消"), style: .cancel)); sheet.popoverPresentationController?.sourceView = tableView.cellForRow(at: indexPath); sheet.popoverPresentationController?.sourceRect = tableView.cellForRow(at: indexPath)?.bounds ?? .zero; present(sheet, animated: true)
        }
        if indexPath.section == 1 { if indexPath.row == 0 { host.call("exportBackup") } else { host.beginImport() } }
        if indexPath.section == 2 && indexPath.row == 1 {
            let license = UIViewController(); license.title = host.label("开源致谢"); let text = UITextView(); text.isEditable = false; text.font = .preferredFont(forTextStyle: .body); text.backgroundColor = Palette.background; text.text = ["OPEN-CADET-NOTICE.md", "ENGINE-LICENSE.txt", "EMSCRIPTEN-LICENSE.txt", "SDL2-LICENSE.txt", "SDL2-MIXER-LICENSE.txt", "OPEN-CADET-CC0.txt"].compactMap { name in (try? String(contentsOf: host.root.appendingPathComponent("licenses/space-cadet/" + name), encoding: .utf8)).map { name + "\n\n" + $0 } }.joined(separator: "\n\n────────\n\n"); license.view = text; navigationController?.pushViewController(license, animated: true)
        }
    }
}
