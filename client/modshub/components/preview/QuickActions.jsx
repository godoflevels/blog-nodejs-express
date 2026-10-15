import { Button, Menu } from '../ui.jsx';
import { useRendered } from './hooks.js';
import { useExportActions } from './useExportActions.jsx';
import { useStudio } from '../../state/StudioContext.jsx';

/** Sticky copy/download bar for phones so export is one tap from any tab. */
export default function QuickActions({ post }) {
  const { setUi } = useStudio();
  const rendered = useRendered(post.content);
  const { copy, download, dialog } = useExportActions(post, rendered.plain, rendered.mdOptions);
  return (
    <div className="ms-quick" role="group" aria-label="Copy and download">
      <Button variant="soft" size="sm" icon="copy" onClick={() => copy('markdown')}>Markdown</Button>
      <Button variant="soft" size="sm" icon="copy" onClick={() => copy('rich')}>Rich text</Button>
      <Menu
        align="right"
        label="Copy and download options"
        trigger={<Button variant="primary" size="sm" icon="download">Export</Button>}
        items={[
          { heading: 'Copy' },
          { label: 'Copy Plain Text', icon: 'copy', onClick: () => copy('plain') },
          { label: 'Copy JSON', icon: 'copy', onClick: () => copy('json') },
          { heading: 'Download' },
          { label: 'Markdown (.md)', icon: 'download', onClick: () => download('md') },
          { label: 'Plain Text (.txt)', icon: 'download', onClick: () => download('txt') },
          { label: 'JSON (.json)', icon: 'download', onClick: () => download('json') },
          { label: 'Image (.png)…', icon: 'image', onClick: () => setUi({ mobileTab: 'export' }) },
        ]}
      />
      {dialog}
    </div>
  );
}
