// Apps built with the iOS 27 SDK must adopt the UIScene life cycle or UIKit
// traps at launch (EXC_BREAKPOINT in __UIApplicationEvaluateRuntimeIssues).
// Expo SDK 57 ships `ExpoAppSceneDelegate` for this, but its app template still
// creates the window in the AppDelegate, so this plugin opts in:
// (1) Info.plist declares a scene manifest pointing at Expo's scene delegate,
// (2) the AppDelegate becomes an `ExpoReactNativeFactoryProvider` and stops
//     creating its own window (the scene delegate creates it per scene and
//     forwards scene life-cycle, URL and user-activity events to Expo modules).
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const MARKER = '// @astropedia/uiscene-lifecycle';

const CLASS_DECL = 'class AppDelegate: ExpoAppDelegate {';
const WINDOW_BLOCK = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;

function applyAppDelegate(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!contents.includes(CLASS_DECL) || !WINDOW_BLOCK.test(contents)) {
    throw new Error(
      '[with-uiscene-lifecycle] AppDelegate.swift does not match the Expo SDK 57 template; update the plugin.'
    );
  }
  return contents
    .replace(CLASS_DECL, `${MARKER}\nclass AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {`)
    .replace(WINDOW_BLOCK, '    // The window is created per scene by ExpoAppSceneDelegate (UIScene life cycle).\n');
}

function applyInfoPlist(plist) {
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
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
