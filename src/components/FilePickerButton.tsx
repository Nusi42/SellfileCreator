import React from 'react'
import { Button, Typography } from '@mui/material'
import type { ButtonProps } from '@mui/material/Button'
import { ELLIPSIS_TEXT_SX, FONT_SIZE_BASE_PX } from '../lib/constants'
import EllipsisTooltip from './EllipsisTooltip'

type FilePickerButtonProps = Omit<ButtonProps, 'component' | 'children' | 'onSelect'> & {
  label: string
  startIcon?: React.ReactNode
  accept: string
  onSelect: (file: File, context?: { shiftKey?: boolean }) => void | Promise<void>
  /**
   * Called on click before the native file chooser opens. Return `true` to
   * suppress opening the dialog (e.g. to redirect the click into a menu on the
   * first session click). Returning void/false keeps the default open behavior.
   */
  onBeforeOpen?: (event: React.MouseEvent<HTMLButtonElement>) => void | boolean
  buttonProps?: ButtonProps
  labelMaxWidth?: number
  children?: React.ReactNode
  ref?: React.Ref<HTMLButtonElement>
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

function FilePickerButton(props: FilePickerButtonProps) {
  const {
    label,
    startIcon,
    accept,
    onSelect,
    onBeforeOpen,
    buttonProps,
    labelMaxWidth,
    children,
    ref: forwardedRef,
    ...passThroughProps
  } = props
  const buttonStartIcon = children ? undefined : startIcon
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  // Preserve key modifiers from the click that opened the picker.
  // Why: `<input type="file">` change events do not expose the original click event.
  const pendingModifierRef = React.useRef<{ shiftKey?: boolean }>({})

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
      // Whether onBeforeOpen vetoed opening the native chooser this click.
      let suppressed = false
      try {
        // Capture modifiers before the native file chooser takes focus.
        pendingModifierRef.current = { shiftKey: Boolean(event.shiftKey) }
        // A truthy return means "don't open the dialog" (e.g. show a menu instead).
        suppressed = onBeforeOpen?.(event) === true
      } catch {
        // keep file picker responsive even if observers throw
      }
      if (typeof injectedOnClick === 'function') {
        injectedOnClick(event)
      }
      if (typeof buttonOnClick === 'function') {
        buttonOnClick(event)
      }
      // We drive the hidden input manually (rather than component="label") so a
      // veto from onBeforeOpen can keep the chooser closed on the first click.
      if (!suppressed) inputRef.current?.click()
    },
    [buttonOnClick, injectedOnClick, onBeforeOpen],
  )

  const resolvedTitle = buttonTitle ?? injectedTitle ?? label
  const buttonNode = (
    <Button
      ref={handleButtonRef}
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
          if (file) void onSelect(file, pendingModifierRef.current)
          // Reset pending modifiers after each selection so stale keys do not leak.
          pendingModifierRef.current = {}
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
}

FilePickerButton.displayName = 'FilePickerButton'

export default FilePickerButton
