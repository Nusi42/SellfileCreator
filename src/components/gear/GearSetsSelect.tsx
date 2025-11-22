import { useCallback, useMemo, useRef, useState } from 'react'
import { Box, ListSubheader, MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import { useI18n } from '../../lib/i18n'
import type { ArtifactSetId } from '../../lib/types'
import { artifactSetI18nKey, artifactSetName, filterAndSortSetEntries } from '../../lib/types'
import type { Metaset } from '../../lib/metasets'
import { metasetGlyph, orderMetasetIds } from '../../lib/metasets'
import { useSetsOrderPreference } from '../../state/setsOrderPreference'
import InlineSelectClearButton from '../InlineSelectClearButton'
import SelectDropdownActivator from '../SelectDropdownActivator'
import SetMenuSection from '../SetMenuSection'
import SetsOrderControls from '../SetsOrderControls'
import EllipsisTooltip from '../EllipsisTooltip'
import {
  LIST_SUBHEADER_SX,
  MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX,
  MENU_MAX_HEIGHT_METASETS_PX,
  MENU_MAX_HEIGHT_SETS_LIST_PX,
  MENU_SCROLL_GUTTER_PX,
  SETS_MENU_WIDTH_PX,
  SETS_SELECT_INLINE_GUTTER_PX,
} from '../../lib/constants'

type GearSetsSelectProps = {
  value: ArtifactSetId[]
  onChange: (next: ArtifactSetId[]) => void
  metasets?: Metaset[]
  selectedMetasetIds?: string[]
  onChangeMetasetIds?: (next: string[]) => void
  allowedSetIds?: readonly ArtifactSetId[]
  size?: SelectProps<string[]>['size']
  dataTourId?: string
  showMetasets?: boolean
  menuWidthPx?: number
}

export default function GearSetsSelect({
  value,
  onChange,
  metasets = [],
  selectedMetasetIds = [],
  onChangeMetasetIds,
  allowedSetIds,
  size = 'small',
  dataTourId,
  showMetasets = true,
  menuWidthPx = SETS_MENU_WIDTH_PX,
}: GearSetsSelectProps) {
  const { t } = useI18n()
  const [setsOrder, setSetsOrder] = useSetsOrderPreference()
  const [setsSearch, setSetsSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchorPos, setMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [hoveredMetasetId, setHoveredMetasetId] = useState<string | null>(null)
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const setsMenuListRef = useRef<HTMLUListElement | null>(null)
  const metasetsMenuListRef = useRef<HTMLUListElement | null>(null)
  const selectContainerRef = useRef<HTMLDivElement | null>(null)
  const allowMetasets = showMetasets && Boolean(onChangeMetasetIds)
  const allowedSetFilter = useMemo(() => (
    allowedSetIds ? new Set(allowedSetIds.map(Number)) : null
  ), [allowedSetIds])
  const visibleMetasets = useMemo(
    () => (allowMetasets ? metasets.filter((meta) => meta.show !== false) : []),
    [allowMetasets, metasets],
  )
  const orderBasis = visibleMetasets.length ? visibleMetasets : metasets
  const orderedMetaSelected = useMemo(
    () => orderMetasetIds(allowMetasets ? selectedMetasetIds : [], orderBasis),
    [allowMetasets, orderBasis, selectedMetasetIds],
  )
  const selectedTokens = useMemo(() => ([
    ...orderedMetaSelected.map((id) => `m:${id}`),
    ...value.map((id) => `s:${Number(id)}`),
  ]), [orderedMetaSelected, value])

  const renderValue = useCallback((tokens: string[]) => {
    if (tokens.length === 0) {
      return (
        <Box component="span" sx={{ display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {t('any')}
        </Box>
      )
    }
    const names: string[] = []
    for (const token of tokens) {
      if (token.startsWith('m:')) {
        const id = token.slice(2)
        const meta = metasets.find((m) => m.id === id)
        if (!meta) continue
        const { glyph, iconId } = metasetGlyph(meta)
        if (glyph != null && iconId) {
          const needsGap = iconId !== 'empty'
          names.push(`${glyph}${needsGap ? ` ${meta.name}` : meta.name}`)
        } else {
          names.push(meta.name)
        }
      } else if (token.startsWith('s:')) {
        const id = Number(token.slice(2))
        const localized = t(artifactSetI18nKey(id)) || artifactSetName(id)
        names.push(localized)
      }
    }
    const text = names.length === 0 ? t('any') : names.join(', ')
    return (
      <Box
        component="span"
        data-ellipsis-target
        title={text}
        sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {text}
      </Box>
    )
  }, [metasets, t])

  const handleTokensChange = useCallback((e: SelectChangeEvent<string[]>) => {
    const tokens = Array.isArray(e.target.value) ? e.target.value : []
    const setIds = tokens.filter((token) => token.startsWith('s:')).map((token) => Number(token.slice(2)) as ArtifactSetId)
    const metaIds = allowMetasets ? orderMetasetIds(tokens.filter((token) => token.startsWith('m:')).map((token) => token.slice(2)), orderBasis) : []
    const normalizedSets = Array.from(new Set(setIds.map((id) => Number(id)))).sort((a, b) => a - b).map((id) => id as ArtifactSetId)
    onChange(normalizedSets)
    if (allowMetasets && onChangeMetasetIds) {
      onChangeMetasetIds(metaIds)
    }
  }, [allowMetasets, onChange, onChangeMetasetIds, orderBasis])

  const scrollSetsMenuToSelected = useCallback((orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && !menuOpen) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRef.current
    if (!list) return
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, { translate: t })
    const filtered = allowedSetFilter ? sortedForOrder.filter(([id]) => allowedSetFilter.has(Number(id))) : sortedForOrder
    const selectedIds = new Set(value.map(Number))
    let target: number | null = null
    for (const [id] of filtered) {
      const idNum = Number(id)
      if (selectedIds.has(idNum)) {
        target = idNum
        break
      }
    }
    if (target === null) return
    const scroll = () => {
      const item = list.querySelector<HTMLElement>(`[data-set-id="${target}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    }
    requestAnimationFrame(() => requestAnimationFrame(scroll))
  }, [allowedSetFilter, menuOpen, setsOrder, setsSearch, t, value])

  const sortedSets = useMemo(() => {
    const base = filterAndSortSetEntries(setsSearch, setsOrder, { translate: t })
    if (!allowedSetFilter) return base
    return base.filter(([id]) => allowedSetFilter.has(Number(id)))
  }, [allowedSetFilter, setsOrder, setsSearch, t])

  const handleToggleSet = useCallback((setId: number) => {
    const numeric = Number(setId)
    const next = new Set(value.map(Number))
    if (next.has(numeric)) {
      next.delete(numeric)
    } else {
      next.add(numeric)
    }
    const normalized = Array.from(next).sort((a, b) => a - b).map((id) => id as ArtifactSetId)
    onChange(normalized)
  }, [onChange, value])

  const metasetsMenu = useMemo(() => {
    if (!allowMetasets) return []
    if (!allowedSetFilter) return visibleMetasets
    return visibleMetasets.filter((meta) => meta.sets.every((setId) => allowedSetFilter.has(Number(setId))))
  }, [allowMetasets, allowedSetFilter, visibleMetasets])
  const hasSelection = selectedTokens.length > 0

  const handleClear = useCallback(() => {
    onChange([])
    if (allowMetasets && onChangeMetasetIds) onChangeMetasetIds([])
  }, [allowMetasets, onChange, onChangeMetasetIds])

  return (
    <Box ref={selectContainerRef} sx={{ position: 'relative' }}>
      <Select
        multiple
        size={size}
        value={selectedTokens}
        onChange={handleTokensChange}
        renderValue={renderValue}
        data-tour-id={dataTourId}
        displayEmpty
        onOpen={(event) => {
          setMenuOpen(true)
          scrollSetsMenuToSelected(setsOrder, { force: true })
          try {
            const el = (event?.currentTarget as HTMLElement | null)
            const rect = el?.getBoundingClientRect()
            const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
            const margin = 8
            const theoreticalMax = metasetsMenu.length > 0
              ? MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX
              : MENU_MAX_HEIGHT_SETS_LIST_PX
            const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
            const desiredLeft = rect ? Math.floor(rect.left) : margin
            setMenuAnchorPos({ top: desiredTop, left: desiredLeft })
            const refine = () => {
              try {
                const paper = setsMenuPaperRef.current
                const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                if (rect && measured > 0) {
                  const maxHeight = Math.min(measured, viewportH - margin * 2)
                  const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                  setMenuAnchorPos({ top, left: desiredLeft })
                }
              } catch { /* noop */ }
              if (metasetsMenu.length > 0) {
                try {
                  const list = metasetsMenuListRef.current
                  if (!list) return
                  const items = list.querySelectorAll<HTMLElement>('[data-metaset-id]')
                  const selected = new Set(selectedMetasetIds ?? [])
                  const targetMeta = (() => {
                    for (const meta of metasetsMenu) {
                      if (selected.has(meta.id)) return meta.id
                    }
                    return null
                  })()
                  if (targetMeta) {
                    for (const item of items) {
                      if (item.getAttribute('data-metaset-id') === targetMeta) {
                        item.scrollIntoView({ block: 'nearest' })
                        break
                      }
                    }
                  }
                } catch { /* noop */ }
              }
              scrollSetsMenuToSelected(setsOrder, { force: true })
            }
            requestAnimationFrame(() => requestAnimationFrame(refine))
          } catch {
            setMenuAnchorPos(null)
          }
        }}
        onClose={() => {
          setMenuOpen(false)
          setMenuAnchorPos(null)
          setHoveredMetasetId(null)
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              width: { xs: 'calc(100vw - 32px)', sm: menuWidthPx },
              maxWidth: menuWidthPx,
              overflowX: 'hidden',
            },
            ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el },
          },
          MenuListProps: { sx: { width: '100%', maxWidth: '100%' } },
          ...(menuAnchorPos
            ? { anchorReference: 'anchorPosition' as const, anchorPosition: menuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
            : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
        }}
        sx={{
          width: '100%',
          minWidth: 0,
          cursor: 'pointer',
          pr: `${SETS_SELECT_INLINE_GUTTER_PX}px`,
          '& .MuiSelect-select': {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            maxWidth: '100%',
            cursor: 'pointer',
          },
          '& .MuiSelect-icon': {
            right: 8,
          },
        }}
      >
        {allowMetasets && metasetsMenu.length > 0 ? (
          <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
            <Box
              component="ul"
              ref={metasetsMenuListRef}
              sx={{
                listStyle: 'none',
                p: 0,
                m: 0,
                maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                overflowY: 'auto',
                pr: `${MENU_SCROLL_GUTTER_PX}px`,
                scrollbarGutter: 'stable both-edges',
              }}
              data-tour-id="menu.metasets.section"
            >
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('menuMetasetsSection')}</ListSubheader>
              {metasetsMenu.map((meta) => {
                const { glyph, iconId } = metasetGlyph(meta)
                const hasGlyph = glyph != null && !!iconId
                const needsGap = iconId !== null && iconId !== 'empty'
                const tooltipName = hasGlyph ? `${glyph}${needsGap ? ` ${meta.name}` : meta.name}` : meta.name
                const displayGap = hasGlyph && needsGap ? 0.75 : 0.5
                const selected = (selectedMetasetIds ?? []).includes(meta.id)
                const setNames = meta.sets.map((id) => t(artifactSetI18nKey(id))).filter(Boolean)
                const joined = setNames.join(', ')
                return (
                  <MenuItem
                    key={meta.id}
                    value={`m:${meta.id}`}
                    selected={selected}
                    data-metaset-id={meta.id}
                    onMouseEnter={() => setHoveredMetasetId(meta.id)}
                    onMouseLeave={() => setHoveredMetasetId((prev) => (prev === meta.id ? null : prev))}
                    onClick={(evt) => {
                      evt.preventDefault()
                      evt.stopPropagation()
                      if (!onChangeMetasetIds) return
                      const token = `m:${meta.id}`
                      const tokens = new Set(selectedTokens)
                      if (tokens.has(token)) tokens.delete(token); else tokens.add(token)
                      const metaIds = Array.from(tokens).filter((tok) => tok.startsWith('m:')).map((tok) => tok.slice(2))
                      onChangeMetasetIds(orderMetasetIds(metaIds, orderBasis))
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                      <EllipsisTooltip title={tooltipName} wrap="block" disablePortal={false}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: displayGap, minWidth: 0 }}>
                          {hasGlyph ? (
                            <Box component="span" aria-hidden sx={{ fontSize: 18, width: 22, textAlign: 'center', lineHeight: 1 }}>
                              {glyph}
                            </Box>
                          ) : null}
                          <Box component="span" data-ellipsis-target sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {meta.name}
                          </Box>
                        </Box>
                      </EllipsisTooltip>
                      {setNames.length > 0 ? (
                        <Box component="span" sx={{ fontSize: 12, color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }} title={joined}>
                          {joined}
                        </Box>
                      ) : null}
                    </Box>
                  </MenuItem>
                )
              })}
            </Box>
          </Box>
        ) : null}
        <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
          <ListSubheader
            component="div"
            sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <SetsOrderControls
                setsSearch={setsSearch}
                onSetsSearchChange={setSetsSearch}
                setsOrder={setsOrder}
                onSetsOrderChange={(next) => {
                  if (!next) return
                  setSetsOrder(next)
                  scrollSetsMenuToSelected(next, { force: true })
                }}
                zeroResults={sortedSets.length === 0}
              />
            </Box>
          </ListSubheader>
          <Box
            component="ul"
            ref={setsMenuListRef}
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              ...(setsOrder === 'icons'
                ? { maxHeight: 'none', height: 'auto', overflowY: 'visible' }
                : { maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX, height: MENU_MAX_HEIGHT_SETS_LIST_PX, overflowY: 'auto' }),
              pr: `${MENU_SCROLL_GUTTER_PX}px`,
              scrollbarGutter: 'stable both-edges' as const,
            }}
          >
            <SetMenuSection
              title="Sets"
              sorted={sortedSets}
              setsOrder={setsOrder}
              metasets={metasets}
              setUsageCounts={{}}
              showUsageCounts={false}
              hideHeader
              valueForSet={(id) => `s:${id}`}
              hoveredMetasetId={hoveredMetasetId}
              selectedMetasetIds={selectedMetasetIds}
              selectedSetIds={value.map(Number)}
              onToggleSet={handleToggleSet}
            />
          </Box>
        </Box>
      </Select>
      <InlineSelectClearButton
        disabled={!hasSelection}
        label={t('clear')}
        onClear={handleClear}
      />
      <SelectDropdownActivator
        getDisplayNode={() => {
          const root = selectContainerRef.current
          if (!root) return null
          return root.querySelector('[role="combobox"]') as HTMLElement | null
        }}
      />
    </Box>
  )
}
