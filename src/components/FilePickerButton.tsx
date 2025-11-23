import React from 'react'
import { Button, Typography } from '@mui/material'
import type { ButtonProps } from '@mui/material/Button'
import { ELLIPSIS_TEXT_SX, FONT_SIZE_BASE_PX } from '../lib/constants'
import EllipsisTooltip from './EllipsisTooltip'

type FilePickerButtonProps = Omit<ButtonProps, 'component' | 'children' | 'onSelect'> & {
  label: string
  startIcon?: React.ReactNode
  accept: string
  onSelect: (file: File) => void | Promise<void>
  onBeforeOpen?: () => void
  buttonProps?: ButtonProps
  labelMaxWidth?: number
  children?: React.ReactNode
}

function assignRef<T>(ref: React.Ref<T | null> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  try {
    ;(ref as React.MutableRefObject<T | null>).current = value
  } catch {
    // no-op: consumer ref rejected the assignment
  }
}

const FilePickerButton = React.forwardRef<HTMLButtonElement, FilePickerButtonProps>((props, forwardedRef) => {
  const {
    label,
    startIcon,
    accept,
    onSelect,
    onBeforeOpen,
    buttonProps,
    labelMaxWidth,
    children,
    ...passThroughProps
  } = props
  const buttonStartIcon = children ? undefined : startIcon
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const {
    sx: buttonSx,
    title: buttonTitle,
    onClick: buttonOnClick,
    ref: buttonRef,
    ...restButtonProps
  } = buttonProps ?? {}
  const {
    sx: injectedSx,
    onClick: injectedOnClick,
    title: injectedTitle,
    ...restInjectedProps
  } = passThroughProps
  const extraSx = labelMaxWidth ? { maxWidth: labelMaxWidth, overflow: 'hidden' as const } : undefined
  const mergeSxValues = (...values: Array<ButtonProps['sx'] | undefined>): ButtonProps['sx'] | undefined => {
    const parts: Array<Exclude<ButtonProps['sx'], undefined>> = []
    for (const value of values) {
      if (!value) continue
      if (Array.isArray(value)) {
        for (const entry of value) {
          parts.push(entry as Exclude<ButtonProps['sx'], undefined>)
        }
      } else {
        parts.push(value)
      }
    }
    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0]
    return parts as unknown as ButtonProps['sx']
  }
  const mergedSx = mergeSxValues(extraSx, buttonSx, injectedSx)

  const handleButtonRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      assignRef(forwardedRef, node)
      assignRef(buttonRef, node)
    },
    [forwardedRef, buttonRef],
  )

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      try {
        onBeforeOpen?.()
      } catch {
        // keep file picker responsive even if observers throw
      }
      if (typeof injectedOnClick === 'function') {
        injectedOnClick(event)
      }
      if (typeof buttonOnClick === 'function') {
        buttonOnClick(event)
      }
    },
    [buttonOnClick, injectedOnClick, onBeforeOpen],
  )

  const resolvedTitle = buttonTitle ?? injectedTitle ?? label
  const buttonNode = (
    <Button
      ref={handleButtonRef}
      component="label"
      startIcon={buttonStartIcon}
      onClick={handleClick}
      {...restButtonProps}
      {...restInjectedProps}
      {...(mergedSx ? { sx: mergedSx } : {})}
    >
      {children ?? (
        <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { fontSize: FONT_SIZE_BASE_PX }]} data-ellipsis-target>
          {label}
        </Typography>
      )}
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

  if (!resolvedTitle) return buttonNode
  return (
    <EllipsisTooltip title={resolvedTitle}>
      {buttonNode}
    </EllipsisTooltip>
  )
})

FilePickerButton.displayName = 'FilePickerButton'

export default FilePickerButton
