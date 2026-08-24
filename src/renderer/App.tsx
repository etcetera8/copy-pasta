import { createRoot } from 'react-dom/client';
import { Version } from './components/Version';
import { Landing } from './pages/Landing';
import { ClipboardStore } from './store/clipboardStore';
import { hydrateAndPersist } from './store/persist';
import './styles/index.scss';

const store = new ClipboardStore();

// Deliberately not awaited: the UI renders immediately and fills in when main
// answers, rather than holding a blank window open until it does.
void hydrateAndPersist(store);

// `ReactDOM.render` was removed in React 19.
//
// The version line used to be a bare `<p id="version">` in index.html that
// main tried to fill in (bug 10). It is a component now, mounted here beside
// the page rather than left lying in the document for someone to find.
createRoot(document.getElementById('root')).render(
  <>
    <Landing store={store} />
    <Version />
  </>,
);
