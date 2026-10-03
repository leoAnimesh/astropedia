// Runs iOS on classic Hermes instead of Hermes V1.
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
const { withPodfileProperties } = require('@expo/config-plugins');

module.exports = function withClassicHermes(config) {
  return withPodfileProperties(config, (cfg) => {
    cfg.modResults['expo.useHermesV1'] = 'false';
    return cfg;
  });
};
