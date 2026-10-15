/**
 * Built-in post templates. They only ever create an editable *draft* - nothing
 * here publishes or schedules anything by itself. Placeholders are written in
 * [square brackets] so they are easy to spot and replace.
 */
export const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin-new-mod',
    name: 'New mod release',
    builtIn: true,
    title: 'New mod: [Mod name]',
    category: 'new-mods',
    tags: ['new-mod'],
    content: `# [Mod name] is out

[One sentence about what this mod changes in the game.]

## Highlights

- [Highlight one]
- [Highlight two]
- [Highlight three]

**Compatibility:** [game version / required mods]

[Download it on ModsHub](https://modshub.io/)
`,
  },
  {
    id: 'builtin-update',
    name: 'Update announcement',
    builtIn: true,
    title: 'Update [version]',
    category: 'updates',
    tags: ['update'],
    content: `# Update [version]

What's new in this release:

## Added

- [New thing]

## Improved

- [Improvement]

## Fixed

- [Fix]

> Update from the ModsHub app or download the latest version from the library.
`,
  },
  {
    id: 'builtin-feature',
    name: 'Feature announcement',
    builtIn: true,
    title: 'New feature: [Feature name]',
    category: 'announcements',
    tags: ['feature'],
    content: `# Introducing [Feature name]

[Why it matters, in one or two sentences.]

### How it works

1. [Step one]
2. [Step two]
3. [Step three]

*Available now.*
`,
  },
  {
    id: 'builtin-community',
    name: 'Community announcement',
    builtIn: true,
    title: 'Community: [Topic]',
    category: 'community',
    tags: ['community'],
    content: `# [Topic]

Hey everyone! [Short message to the community.]

- **When:** [date]
- **Where:** [place / link]

Thank you for being part of ModsHub. ❤️
`,
  },
  {
    id: 'builtin-promo',
    name: 'Promotional post',
    builtIn: true,
    title: 'Promo: [Offer]',
    category: 'promotions',
    tags: ['promo'],
    content: `# [Offer headline]

**[Discount or benefit]** until [date].

~~[Old price]~~ **[New price]**

[Get it now](https://modshub.io/)
`,
  },
];
