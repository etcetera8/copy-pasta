import { FC, useEffect, useState } from 'react';
import type { UpdateInfo } from '../../shared/types';
import '../styles/version.scss';

/**
 * The app version, as reported by the main process.
 *
 * This is bug 10's other half. The original code sat in `src/main/index.ts`
 * and did `document.getElementById('version')` plus `ipcRenderer.send(...)` --
 * renderer code in a process that has neither, which threw before any of the
 * lines after it could run.
 *
 * The fix is not to move that same imperative DOM poke into a renderer effect:
 * the element is owned by React now. The effect only fetches, the value lives
 * in state, and the paragraph is rendered from it -- so nothing outside the
 * component tree has to exist for the version to show up, and no code has to
 * guess which process it is running in.
 */
export const Version: FC = () => {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let live = true;

    void window.copyPasta
      .getVersion()
      .then((v) => {
        if (live) setVersion(v);
      })
      .catch(() => {
        // Main is the only source for this; if it cannot answer there is
        // nothing to show. Swallowed rather than left to reject unhandled.
      });

    return () => {
      live = false;
    };
  }, []);

  // Separate from the version fetch so a slow or failed update check can never
  // hold back the version string.
  useEffect(() => {
    let live = true;

    void window.copyPasta
      .getUpdateInfo()
      .then((info) => {
        if (live) setUpdate(info);
      })
      .catch(() => {
        // No update to offer. Silence is the correct outcome.
      });

    return () => {
      live = false;
    };
  }, []);

  if (version === null) return null;

  return (
    <p className="version">
      {`Version ${version}`}
      {update && (
        <>
          {' \u00b7 '}
          {/* A button, not a link: there is no href to follow. Main holds the
              URL, and this only asks it to open. */}
          <button
            type="button"
            className="update-link"
            onClick={(): void => window.copyPasta.openReleasePage()}
          >
            {`${update.version} available`}
          </button>
        </>
      )}
    </p>
  );
};
