import { useStudio } from '../state/StudioContext.jsx';
import { Icon, Menu } from './ui.jsx';
import { useExportAll, useNewPostItems } from './newPost.jsx';

/** Bottom tab bar of the browsing screens on phones. */
export function BrowseTabbar({ onImport, onSettings }) {
  const { ui, setUi, userName } = useStudio();
  const exportAll = useExportAll();
  const tab = (id, label, icon) => (
    <button
      type="button"
      role="tab"
      aria-selected={ui.view === id}
      className={ui.view === id ? 'is-active' : ''}
      onClick={() => setUi({ view: id })}
    >
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="ms-tabbar ms-tabbar--browse" role="tablist" aria-label="View">
      {tab('calendar', 'Calendar', 'calendar')}
      {tab('posts', 'Posts', 'layers')}
      <Menu
        label="More"
        title={userName ? `${userName} · shared calendar` : 'More'}
        placement="top-end"
        trigger={
          <button type="button" aria-label="More">
            <Icon name="more" size={22} />
            <span>More</span>
          </button>
        }
        items={[
          { label: 'Import JSON, Markdown or text…', icon: 'upload', onClick: onImport },
          { label: 'Export all as JSON', icon: 'download', onClick: exportAll },
          { label: 'Settings', icon: 'settings', onClick: onSettings },
          { divider: true },
          { label: 'Admin dashboard', icon: 'home', onClick: () => window.location.assign('/dashboard') },
          { label: 'Log out', icon: 'logout', danger: true, onClick: () => window.location.assign('/logout') },
        ]}
      />
    </nav>
  );
}

/** The round "+" in the corner of the phone screens. */
export function NewPostFab() {
  const items = useNewPostItems();
  return (
    <Menu
      label="New post"
      title="New post"
      placement="top-end"
      className="ms-fabwrap"
      trigger={
        <button type="button" className="ms-fab" data-testid="new-post" aria-label="New post">
          <Icon name="plus" size={26} />
        </button>
      }
      items={items}
    />
  );
}
