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
const container = document.getElementById('root');
if (!container) {
  // index.html owns this element. If it ever goes missing, say so plainly
  // rather than letting React fail with an opaque message.
  throw new Error('Cannot mount: #root is missing from index.html');
}

createRoot(container).render(
  <>
    <Landing store={store} />
    <Version />
  </>,
);
