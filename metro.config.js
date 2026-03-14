const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    blockList: exclusionList([
      /nodejs-assets\/.*/,
      /android\/.*/,
      /ios\/.*/,
    ]),
  },
};

module.exports = mergeConfig(defaultConfig, config);
