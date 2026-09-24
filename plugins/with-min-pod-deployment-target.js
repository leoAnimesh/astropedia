// Xcode 27 rejects pods whose IPHONEOS_DEPLOYMENT_TARGET is below 15.0
// (e.g. RNSVG, SDWebImage ship 9.0/12.4). Raise every pod to the app's
// minimum inside the Podfile's post_install so `expo prebuild` keeps it.
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# @astropedia/min-pod-deployment-target';

module.exports = function withMinPodDeploymentTarget(config, { minVersion = '15.1' } = {}) {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;

    const snippet = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${minVersion}')
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minVersion}'
        end
      end
    end
`;
    contents = contents.replace(/post_install do \|installer\|\n/, (m) => m + snippet);
    cfg.modResults.contents = contents;
    return cfg;
  });
};
