import React from 'react'
import { Button } from '@mui/material'
import type { ButtonProps } from '@mui/material/Button'

export default function FilePickerButton(props: {
  label: string
  startIcon?: React.ReactNode
  accept: string
  onSelect: (file: File) => void | Promise<void>
  onBeforeOpen?: () => void
  buttonProps?: ButtonProps
}) {
  const { label, startIcon, accept, onSelect, onBeforeOpen, buttonProps } = props
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  return (
    <Button
      component="label"
      startIcon={startIcon}
      onClick={() => { try { onBeforeOpen?.() } catch {} }}
      {...buttonProps}
    >
      {label}
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

