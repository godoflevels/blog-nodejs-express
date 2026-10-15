export const STATUS_META = {
  draft: { label: 'Draft', color: '#8b9199' },
  planned: { label: 'Planned', color: '#0087da' },
  ready: { label: 'Ready', color: '#00a170' },
  published: { label: 'Published', color: '#9878f5' },
  archived: { label: 'Archived', color: '#565a5f' },
};
export const STATUS_ORDER = ['draft', 'planned', 'ready', 'published', 'archived'];

export const TARGET_OPTIONS = [
  ['gfm', 'Full GitHub Markdown'],
  ['telegram', 'Telegram'],
  ['discord', 'Discord'],
  ['plain', 'Plain text only'],
];
