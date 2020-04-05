import * as React from 'react';
import dataStore from './store/dataStore';  
import * as ReactDOM from 'react-dom';
import Landing from './pages/Landing';
import './styles/index.scss';

ReactDOM.render(
  <Landing dataStore={dataStore} />,
  document.getElementById('root')
);
