/**
 * OverridesNumberField — numeric TextField for the override-block editor, wired to
 * the app's shared NumberSpinnerAdornment (the substat-menu / minima-dialog style):
 * custom up/down stepper column, native browser spinner suppressed. One wrapper so
 * every numeric input in the editor (slider params, mark positions, setval values)
 * gets the identical look and stepping behavior.
 */
import type { JSX } from 'react'
import { TextField } from '@mui/material'
import { NumberSpinnerAdornment, HIDE_NATIVE_NUMBER_SPINNER_SX } from '../NumberSpinnerAdornment'

export interface OverridesNumberFieldProps {
  value: number
  onChange: (next: number) => void
  label?: string
  // Accessible name for the field + its stepper group (falls back to the label).
  ariaLabel?: string
  // Step applied by the up/down buttons (typing accepts any finite number in range).
  step?: number
  // Optional bounds (from the field's apply-side clamp SSOT); typed and stepped
  // values clamp so the editor never holds a value the resolver would discard.
  // `| undefined` so callers can forward possibly-absent ranges (exactOptionalPropertyTypes).
  min?: number | undefined
  max?: number | undefined
  width?: number
  testId?: string
}

export function OverridesNumberField({ value, onChange, label, ariaLabel, step = 1, min, max, width = 96, testId }: OverridesNumberFieldProps): JSX.Element {
  const name = ariaLabel ?? label ?? 'number'
  // Single clamp path shared by typing and stepping.
  const clamp = (next: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={(event) => {
        const parsed = Number.parseFloat(event.target.value)
        // Ignore transient invalid states (empty / lone minus) instead of committing NaN.
        if (Number.isFinite(parsed)) onChange(clamp(parsed))
      }}
      size="small"
      sx={{ width, ...HIDE_NATIVE_NUMBER_SPINNER_SX }}
      slotProps={{
        htmlInput: { 'data-testid': testId, 'aria-label': label ? undefined : name, min, max },
        input: {
          endAdornment: (
            <NumberSpinnerAdornment ariaLabel={name} onStep={(delta) => onChange(clamp(value + delta * step))} />
          ),
        },
      }}
    />
  )
}
