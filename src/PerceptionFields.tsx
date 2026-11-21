export type Perception = { intensity: number; clarity: number; comfort: number }

const fields = [
  ['intensity', 'Scent intensity'],
  ['clarity', 'Clarity / distinctness'],
  ['comfort', 'Comfort'],
] as const

export default function PerceptionFields({ value, onChange }: { value: Perception; onChange: (value: Perception) => void }) {
  return fields.map(([key, label]) => (
    <label key={key}>
      {label} ({value[key]}/10)
      <input type="range" min={0} max={10} step={1} value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />
    </label>
  ))
}
