import { useStudio } from '../../state/StudioContext.jsx';
import { Select } from '../ui.jsx';
import { BACKGROUNDS, IMAGE_PRESETS, MAX_SIDE } from '../../core/image-export.js';

export default function ImageSettings({ options, hasImage }) {
  const { actions, settings } = useStudio();
  const set = (patch) => actions.saveSettings({ imageExport: { ...(settings.imageExport || {}), ...patch } });
  return (
    <div className="ms-imgset">
      <div className="ms-field">
        <span>Size</span>
        <Select label="Size" value={options.preset} onChange={(preset) => set({ preset })} options={Object.entries(IMAGE_PRESETS).map(([id, p]) => ({ value: id, label: `${p.label}${id === 'custom' ? '' : ` — ${p.width} × ${p.height}`}` }))} />
      </div>
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
      <div className="ms-field">
        <span>Long text</span>
        <Select label="Long text" value={options.layout} onChange={(layout) => set({ layout })} options={[{ value: 'slides', label: 'Several slides (split at paragraphs)' }, { value: 'long', label: 'One long image' }]} />
      </div>
      <div className="ms-field">
        <span>Background</span>
        <Select label="Background" value={options.background} onChange={(background) => set({ background })} options={Object.entries(BACKGROUNDS).map(([id, b]) => ({ value: id, label: b.label }))} />
      </div>
      {options.background === 'solid' ? (
        <label className="ms-field">
          <span>Colour</span>
          <input type="color" value={options.solidColor} onChange={(e) => set({ solidColor: e.target.value })} />
        </label>
      ) : null}
      <div className="ms-field" aria-disabled={!hasImage}>
        <span>Artwork</span>
        <Select
          label="Artwork"
          disabled={!hasImage}
          value={hasImage ? options.imageMode : 'none'}
          onChange={(imageMode) => hasImage && set({ imageMode })}
          options={[
            { value: 'design', label: 'Use the image in the design' },
            { value: 'background', label: 'Image as background (with overlay)' },
            { value: 'none', label: 'Text only' },
          ]}
        />
      </div>
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
