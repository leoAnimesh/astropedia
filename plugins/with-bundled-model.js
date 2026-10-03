// Ships the on-device model inside the native app instead of downloading it:
// iOS: files are copied into the app target and added to its Resources, so
//      they're readable at `${MainBundleDir}/<file>`.
// Android: files are copied into the APK's assets under `models/`; the app
//      copies them to its documents folder once on first launch, because the
//      native runner needs a real file path (see utils/local-llm.ts).
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const SOURCE_DIR = 'assets/model';
const FILES = ['astro-135m.pte', 'astro-135m-tokenizer.json'];

function sourcePath(projectRoot, file) {
  const p = path.join(projectRoot, SOURCE_DIR, file);
  if (!fs.existsSync(p)) {
    throw new Error(`[with-bundled-model] missing ${path.join(SOURCE_DIR, file)}; export the model first (ml/scripts/export.sh).`);
  }
  return p;
}

function withBundledModelIos(config) {
  return withXcodeProject(config, (cfg) => {
    const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
    const project = cfg.modResults;
    for (const file of FILES) {
      fs.copyFileSync(sourcePath(projectRoot, file), path.join(platformProjectRoot, projectName, file));
      const relative = `${projectName}/${file}`;
      if (!project.hasFile(relative)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: relative,
          groupName: projectName,
          project,
          isBuildFile: true,
        });
      }
    }
    return cfg;
  });
}

function withBundledModelAndroid(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const dest = path.join(platformProjectRoot, 'app/src/main/assets/models');
      fs.mkdirSync(dest, { recursive: true });
      for (const file of FILES) {
        fs.copyFileSync(sourcePath(projectRoot, file), path.join(dest, file));
      }
      return cfg;
    },
  ]);
}

module.exports = function withBundledModel(config) {
  return withBundledModelAndroid(withBundledModelIos(config));
};
module.exports.FILES = FILES;
