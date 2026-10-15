import { useStudio } from '../../state/StudioContext.jsx';
import { BACKGROUNDS, IMAGE_PRESETS, MAX_SIDE } from '../../core/image-export.js';

export default function ImageSettings({ options, hasImage }) {
  const { actions, settings } = useStudio();
  const set = (patch) => actions.saveSettings({ imageExport: { ...(settings.imageExport || {}), ...patch } });
  return (
    <div className="ms-imgset">
      <label className="ms-field">
        <span>Size</span>
        <select value={options.preset} onChange={(e) => set({ preset: e.target.value })}>
          {Object.entries(IMAGE_PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}{id === 'custom' ? '' : ` — ${p.width} × ${p.height}`}
            </option>
          ))}
        </select>
      </label>
      {options.preset === 'custom' ? (
        <div className="ms-imgset__row">
          <label className="ms-field">
            <span>Width (px)</span>
            <input type="number" min={320} max={MAX_SIDE} value={options.customWidth} onChange={(e) => set({ customWidth: Number(e.target.value) })} />
          </label>
          <label className="ms-field">
            <span>Height (px)</span>
            <input type="number" min={320} max={MAX_SIDE} value={options.customHeight} onChange={(e) => set({ customHeight: Number(e.target.value) })} />
          </label>
        </div>
      ) : null}
      <label className="ms-field">
        <span>Long text</span>
        <select value={options.layout} onChange={(e) => set({ layout: e.target.value })}>
          <option value="slides">Several slides (split at paragraphs)</option>
          <option value="long">One long image</option>
        </select>
      </label>
      <label className="ms-field">
        <span>Background</span>
        <select value={options.background} onChange={(e) => set({ background: e.target.value })}>
          {Object.entries(BACKGROUNDS).map(([id, b]) => (
            <option key={id} value={id}>{b.label}</option>
          ))}
        </select>
      </label>
      {options.background === 'solid' ? (
        <label className="ms-field">
          <span>Colour</span>
          <input type="color" value={options.solidColor} onChange={(e) => set({ solidColor: e.target.value })} />
        </label>
      ) : null}
      <label className="ms-field">
        <span>Artwork</span>
        <select value={options.imageMode} onChange={(e) => set({ imageMode: e.target.value })} disabled={!hasImage}>
          <option value="design">Use the image in the design</option>
          <option value="background">Image as background (with overlay)</option>
          <option value="none">Text only</option>
        </select>
      </label>
      <label className="ms-field">
        <span>Padding — {Math.round(options.padding * 100)}%</span>
        <input type="range" min={0.03} max={0.12} step={0.01} value={options.padding} onChange={(e) => set({ padding: Number(e.target.value) })} />
      </label>
      <label className="ms-field">
        <span>Text size — {Math.round(options.textScale * 100)}%</span>
        <input type="range" min={0.7} max={1.6} step={0.05} value={options.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })} />
      </label>
      <label className="ms-check">
        <input type="checkbox" checked={options.logo} onChange={(e) => set({ logo: e.target.checked })} />
        <span>Show ModsHub logo</span>
      </label>
    </div>
  );
}
