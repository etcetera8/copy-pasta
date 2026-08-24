import { createRoot } from 'react-dom/client';
import { Landing } from './pages/Landing';
import { ClipboardStore } from './store/clipboardStore';
import { hydrateAndPersist } from './store/persist';
import './styles/index.scss';

const store = new ClipboardStore();

// Deliberately not awaited: the UI renders immediately and fills in when main
// answers, rather than holding a blank window open until it does.
void hydrateAndPersist(store);

// `ReactDOM.render` was removed in React 19.
createRoot(document.getElementById('root')).render(<Landing store={store} />);
