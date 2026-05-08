const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

// react-native-executorch-expo-resource-fetcher's package.json "exports" field
// only has "import"/"types" conditions — no "ios"/"react-native" condition —
// so Metro warns and falls back to file resolution. Point it directly to avoid the noise.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-executorch-expo-resource-fetcher') {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/react-native-executorch-expo-resource-fetcher/lib/index.js',
      ),
      type: 'sourceFile',
    };
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
