import React from 'react'
import { Button, Typography } from '@mui/material'
import type { ButtonProps } from '@mui/material/Button'
import { ELLIPSIS_TEXT_SX } from '../lib/constants'

export default function FilePickerButton(props: {
  label: string
  startIcon?: React.ReactNode
  accept: string
  onSelect: (file: File) => void | Promise<void>
  onBeforeOpen?: () => void
  buttonProps?: ButtonProps
  labelMaxWidth?: number
}) {
  const { label, startIcon, accept, onSelect, onBeforeOpen, buttonProps, labelMaxWidth } = props
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const { sx: buttonSx, title, ...restButtonProps } = buttonProps ?? {}
  const extraSx = labelMaxWidth ? { maxWidth: labelMaxWidth, overflow: 'hidden' as const } : undefined
  const mergedSx = extraSx
    ? (Array.isArray(buttonSx)
      ? [extraSx, ...buttonSx]
      : buttonSx
        ? [extraSx, buttonSx]
        : extraSx)
    : buttonSx

  return (
    <Button
      component="label"
      startIcon={startIcon}
      onClick={() => { try { onBeforeOpen?.() } catch {} }}
      {...restButtonProps}
      {...(mergedSx ? { sx: mergedSx } : {})}
      title={title ?? label}
    >
      <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{label}</Typography>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) void onSelect(file)
          try { if (inputRef.current) inputRef.current.value = '' } catch {}
        }}
      />
    </Button>
  )
}
