/**
 * DynamicOverridesPresetSummaryTable
 *
 * Renders a saved dynamic-override set's resolved answers as a two-column table:
 * the question title on the left, its selected answer(s) on the right. Title and answer
 * text run through the shared inline markdown parser in `plainCode` mode: `**bold**` and
 * `*italic*` still apply, but backtick tokens render as plain text (no mono chip) so the
 * whole popout stays in a single, consistent font. Answers left at the note's default are
 * dimmed and tagged so chosen-vs-accepted reads at a glance — mirroring the override cards.
 *
 * A second "Not available for this note" section follows when the preset stored answers
 * for questions entirely absent from the current note. Those questions never appear in the
 * main table (the resolver only emits the note's own questions), so they need their own
 * block. Labels come from the human-readable snapshot captured at save time (savedLabels);
 * old presets without that snapshot produce no unavailable lines, so the section is absent.
 *
 * Used inside the saved-set Popover (replacing the old hover tooltip); the host owns
 * scrolling, so this component is layout-only.
 */
import React from 'react'
import { Box, Divider, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import { parseInlineMarkdown } from './MarkdownTooltip'
import { buildWarningBadgeBase } from '../lib/badgeStyles'
import type { DynamicOverridesSummaryLine, DynamicOverridesUnavailableLine } from '../lib/dynamicOverridesPresetSummary'

/** A saved set's resolved summary, laid out as an aligned title | answers grid. */
export function DynamicOverridesPresetSummaryTable({
  lines,
  unavailableLines = [],
}: {
  lines: DynamicOverridesSummaryLine[]
  unavailableLines?: DynamicOverridesUnavailableLine[]
}) {
  const { t } = useI18n()
  const hasMain = lines.length > 0
  const hasUnavailable = unavailableLines.length > 0
  // Nothing to show at all → keep the same empty copy the tooltip used.
  if (!hasMain && !hasUnavailable) {
    return (
      <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.85 }}>
        {t('noteDynamicOverridesPresetsTooltipEmpty')}
      </Typography>
    )
  }
  return (
    // CSS grid keeps both columns aligned across rows without a heavyweight <table>.
    // Both tracks are bounded fractions with a min so neither can starve the other:
    // a `max-content`/`auto` title track would grab the full width on long prompts and
    // collapse the answer column to 0px (text then wraps one char per line → tall gaps).
    // Top-aligned so multi-answer rows read cleanly against their title.
    <Box
      sx={{
        display: 'grid',
        // Titles run long, answers are usually short, but an over-wide title track makes the
        // whole popout balloon. Keep the title only slightly wider than the answer column so
        // prompts wrap onto a couple of lines instead of stretching the card.
        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
        columnGap: 2,
        rowGap: 1,
        alignItems: 'start',
      }}
    >
      {lines.map((line, index) => (
        <React.Fragment key={line.title}>
          {/* A full-width rule between rows (not before the first) so questions read as
              distinct table rows. Spans both columns via gridColumn: 1 / -1. */}
          {index > 0 ? (
            <Divider sx={{ gridColumn: '1 / -1', opacity: 0.5 }} />
          ) : null}
          {/* Question title (left): inline markdown in plainCode mode. When the preset's stored
              answer for this question is unavailable (option/question gone from the note), a small
              warning badge trails the title so the user can spot stale entries at a glance. */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minWidth: 0 }}>
            <Typography variant="body2" component="div" sx={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
              {parseInlineMarkdown(line.title, { plainCode: true })}
            </Typography>
            {line.hasPresetFallback ? (
              <Tooltip title={t('noteDynamicOverridesPresetsFallbackLineTooltip')} placement="top">
                <Box
                  component="span"
                  aria-label={t('noteDynamicOverridesPresetsFallbackLineTooltip')}
                  sx={(theme) => ({
                    ...buildWarningBadgeBase(theme),
                    flexShrink: 0,
                    // Vertically centre against the first line of the title text.
                    mt: '1px',
                    cursor: 'default',
                  })}
                >
                  !
                </Box>
              </Tooltip>
            ) : null}
          </Box>
          {/* Selected answers (right) stacked vertically in the same body font as the titles. */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
            {line.answers.map((answer) => (
              <Typography
                key={answer.label}
                variant="body2"
                component="div"
                sx={{
                  wordBreak: 'break-word',
                  // Dim answers the user accepted at default so chosen values stand out.
                  ...(answer.isDefault ? { opacity: 0.7 } : {}),
                }}
              >
                {parseInlineMarkdown(answer.label, { plainCode: true })}
                {answer.isDefault ? (
                  <Typography component="span" variant="caption" sx={{ fontStyle: 'italic', opacity: 0.85, ml: 0.5 }}>
                    {t('noteDynamicOverridesPresetsDefaultTag')}
                  </Typography>
                ) : null}
              </Typography>
            ))}
          </Box>
        </React.Fragment>
      ))}

      {/* Unavailable section: stored answers for questions not in the current note.
          Shown below the main table (or alone when the note has no override questions at all).
          Two-column layout (question title left, answer labels right) mirrors the main table.
          Only rendered for presets saved after savedLabels was introduced — old presets produce
          no unavailable lines, so this block is absent for them. */}
      {hasUnavailable ? (
        <>
          <Divider sx={{ gridColumn: '1 / -1', mt: hasMain ? 0.5 : 0, mb: 0.25, opacity: 0.6 }} />
          {/* Section header spans both columns; warning colour ties it to the row badge. */}
          <Typography
            variant="caption"
            sx={(theme) => ({
              gridColumn: '1 / -1',
              color: theme.vars?.palette.warning.main ?? theme.palette.warning.main,
              fontWeight: 600,
              opacity: 0.9,
              mb: 0.25,
            })}
          >
            {t('noteDynamicOverridesPresetsUnavailableHeader')}
          </Typography>
          {unavailableLines.map((line, index) => (
            // questionTitle is human-readable and unique within the unavailable list.
            <React.Fragment key={`unavail-${line.questionTitle}`}>
              {index > 0 ? (
                <Divider sx={{ gridColumn: '1 / -1', opacity: 0.3 }} />
              ) : null}
              {/* Question title (left): dimmed + italic to visually separate from active rows. */}
              <Typography
                variant="body2"
                component="div"
                sx={{ minWidth: 0, wordBreak: 'break-word', opacity: 0.6, fontStyle: 'italic' }}
              >
                {parseInlineMarkdown(line.questionTitle, { plainCode: true })}
              </Typography>
              {/* Answer labels (right): stacked one-per-line like the main table's answer column.
                  parseInlineMarkdown in plainCode mode strips backtick wrappers from auto-generated
                  composite option labels (e.g. `keep 5★ limited sets`) so they render cleanly. */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
                {line.answerLabels.map((label) => (
                  <Typography
                    key={label}
                    variant="body2"
                    component="div"
                    sx={{ wordBreak: 'break-word', opacity: 0.6, fontStyle: 'italic' }}
                  >
                    {parseInlineMarkdown(label, { plainCode: true })}
                  </Typography>
                ))}
              </Box>
            </React.Fragment>
          ))}
        </>
      ) : null}
    </Box>
  )
}

export default DynamicOverridesPresetSummaryTable
