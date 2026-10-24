import { useStudio } from '../state/StudioContext.jsx';
import { Icon, IconButton, Menu } from './ui.jsx';
import { useExportAll, useNewPostItems } from './newPost.jsx';

export function UserMenu({ placement = 'right-start', children }) {
  const { userName } = useStudio();
  return (
    <Menu
      label="Account"
      placement={placement}
      title={userName ? `Signed in as ${userName}` : 'Account'}
      trigger={children}
      items={[
        { heading: 'Everyone who signs in shares this calendar' },
        { label: 'Admin dashboard', icon: 'home', onClick: () => window.location.assign('/dashboard') },
        { label: 'Log out', icon: 'logout', danger: true, onClick: () => window.location.assign('/logout') },
      ]}
    />
  );
}

/** Desktop navigation: logo, new post, Calendar/Posts, tools and the account. */
export default function AppRail({ onImport, onSettings }) {
  const { ui, setUi, userName } = useStudio();
  const newItems = useNewPostItems();
  const exportAll = useExportAll();
  const tab = (id, label, icon) => (
    <button
      type="button"
      role="tab"
      aria-selected={ui.view === id}
      className={`ms-rail__tab ${ui.view === id ? 'is-active' : ''}`}
      onClick={() => setUi({ view: id })}
    >
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </button>
  );
  return (
    <aside className="ms-rail" aria-label="Studio">
      <a href="/modshub" className="ms-rail__logo" aria-label="ModsHub Post Studio" title="ModsHub Post Studio">
        <span>M</span>
      </a>
      <Menu
        label="New post"
        placement="right-start"
        title="New post"
        trigger={
          <button type="button" className="ms-rail__new" data-testid="new-post" aria-label="New post" title="New post">
            <Icon name="plus" size={24} />
          </button>
        }
        items={newItems}
      />
      <nav className="ms-rail__nav" role="tablist" aria-label="View">
        {tab('calendar', 'Calendar', 'calendar')}
        {tab('posts', 'Posts', 'layers')}
      </nav>
      <div className="ms-rail__spacer" />
      <div className="ms-rail__tools">
        <IconButton icon="upload" label="Import" onClick={onImport} />
        <IconButton icon="download" label="Export JSON" onClick={exportAll} />
        <IconButton icon="settings" label="Settings" onClick={onSettings} />
      </div>
      {userName ? (
        <UserMenu>
          <button type="button" className="ms-who" aria-label={`Account: ${userName}`} title={`${userName} · shared calendar`}>
            <i aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</i>
            <span className="ms-sr">{userName} · shared</span>
          </button>
        </UserMenu>
      ) : null}
    </aside>
  );
}
