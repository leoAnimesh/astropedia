// iOS runs classic Hermes (not Hermes V1) to avoid a Hermes V1 GC heap-corruption
// crash on RN 0.86 (facebook/hermes#2190), so compile JS for the classic engine.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }]],
  };
};
