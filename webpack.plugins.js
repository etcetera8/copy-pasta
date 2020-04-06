const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [
  new CopyWebpackPlugin([
    {
      from: path.resolve(__dirname, 'src', 'bowl.png'),
      to: path.resolve(__dirname, '.webpack/main', 'bowl.png')
    },
    {
      from: path.resolve(__dirname, './node_modules/robotjs/build/Release/robotjs.node'),
      to: path.resolve(__dirname, '.webpack/main/')
    }
  ]),
  new ForkTsCheckerWebpackPlugin(),
];
