const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [
  new CopyWebpackPlugin([{
    from: path.resolve(__dirname, 'src', 'bowl.png'),
    to: path.resolve(__dirname, '.webpack/main', 'bowl.png')
  }]),
  new ForkTsCheckerWebpackPlugin(),
];
