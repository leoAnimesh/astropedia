// Apps built with the iOS 27 SDK must adopt the UIScene life cycle or UIKit
// traps at launch (EXC_BREAKPOINT in __UIApplicationEvaluateRuntimeIssues).
// Expo SDK 54's template still creates its window in the AppDelegate, so this
// plugin (1) declares a scene manifest in Info.plist and (2) moves window
// creation into a SceneDelegate, forwarding deep links to the AppDelegate.
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const MARKER = '// @astropedia/uiscene-lifecycle';

const WINDOW_BLOCK = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType: activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions.isEmpty ? nil : launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function applyAppDelegate(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!WINDOW_BLOCK.test(contents)) {
    throw new Error(
      '[with-uiscene-lifecycle] AppDelegate.swift does not match the Expo SDK 54 template; update the plugin.'
    );
  }
  return contents.replace(WINDOW_BLOCK, '    // Window is created per scene in SceneDelegate (UIScene life cycle).\n') + SCENE_DELEGATE;
}

function applyInfoPlist(plist) {
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        },
      ],
    },
  };
  return plist;
}

function withUISceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = applyInfoPlist(cfg.modResults);
    return cfg;
  });
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('[with-uiscene-lifecycle] expected a Swift AppDelegate');
    }
    cfg.modResults.contents = applyAppDelegate(cfg.modResults.contents);
    return cfg;
  });
  return config;
}

module.exports = withUISceneLifecycle;
module.exports.applyAppDelegate = applyAppDelegate;
module.exports.applyInfoPlist = applyInfoPlist;
