const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');

rules.push({
  test: /\.css$/,
  use: [
    {
      loader: 'style-loader'
    },
    {
      loader: 'css-loader',
      options: {
        sourceMap: true,
      }
    },
    {
      loader: 'sass-loader',
      options: {
        sourceMap: true,
      }
    }
  ],
});

module.exports = {
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css']
  },
};
