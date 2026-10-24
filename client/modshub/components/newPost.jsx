import { useMemo } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { todayKey } from '../core/time.js';
import { buildExport, stringifyExport } from '../core/json-io.js';
import { downloadText } from '../core/filenames.js';

/** Menu items for "New post": a blank draft or one of the templates. */
export function useNewPostItems() {
  const { ui, templates, actions, displayZone } = useStudio();
  const newDate = useMemo(() => {
    const today = todayKey(displayZone);
    return ui.cursor.slice(0, 7) === today.slice(0, 7) ? today : ui.cursor;
  }, [ui.cursor, displayZone]);
  return useMemo(
    () => [
      { label: 'Blank draft', icon: 'file', onClick: () => actions.createPost({ date: newDate }) },
      { divider: true },
      { heading: 'From a template' },
      ...templates.map((t) => ({
        label: t.name,
        icon: 'tag',
        hint: t.builtIn ? undefined : 'Yours',
        onClick: () => actions.createPost({ date: newDate, template: t }),
      })),
    ],
    [templates, actions, newDate]
  );
}

export function useExportAll() {
  const { posts, toast } = useStudio();
  return () => {
    if (posts.length === 0) {
      toast('There are no posts to export yet', 'info');
      return;
    }
    downloadText(stringifyExport(buildExport(posts)), `modshub-posts-${posts.length}.json`, 'application/json;charset=utf-8');
    toast(`Exported ${posts.length} post${posts.length === 1 ? '' : 's'} as JSON`);
  };
}
