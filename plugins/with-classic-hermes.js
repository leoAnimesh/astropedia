// Runs iOS on classic Hermes instead of Hermes V1; Android stays on Hermes V1.
//
// Hermes V1 (the RN 0.84+ default) corrupts its GC heap on this app's cold
// launch in RN 0.86 (facebook/hermes#2190): 8/8 simulator launches crashed in
// HadesGC::OldGen::sweepNext / search, 0/10 on classic Hermes.
//
// expo-build-properties' `useHermesV1: false` would do the same, but it insists
// on hermes-compiler 0.15.0 while RN 0.86.3's classic engine is 0.17.0, so set
// the Podfile property directly. Pairs with:
//   - package.json resolutions: hermes-compiler 0.17.0 (release bytecode)
//   - babel.config.js: unstable_transformProfile 'hermes-v0'
// Remove all three once the upstream fix ships.
//
// Android can't use classic Hermes: in RN 0.86 the classic Android engine has
// no Intl ("Property 'Intl' doesn't exist"), which every date and the timezone
// maths need. So Android keeps the V1 runtime and compiles its bundle with the
// matching V1 compiler (devDependency hermes-compiler-v1 = hermes-compiler
// 250829098.0.17, RN 0.86.3's V1 version). The pinned 0.17.0 compiler emits
// bytecode 96, which the V1 runtime rejects ("Expected 98 but got 96").
const { withAppBuildGradle, withGradleProperties, withPodfileProperties } = require('@expo/config-plugins');

module.exports = function withClassicHermes(config) {
  config = withPodfileProperties(config, (cfg) => {
    cfg.modResults['expo.useHermesV1'] = 'false';
    return cfg;
  });
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'hermesV1Enabled'));
    return cfg;
  });
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      "require.resolve('hermes-compiler/package.json'",
      "require.resolve('hermes-compiler-v1/package.json'",
    );
    return cfg;
  });
};
