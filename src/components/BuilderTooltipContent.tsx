import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export interface BuilderTooltipContentProps {
  text: string
}

// Formats builder tooltips into readable blocks with optional bullet lists.
export function BuilderTooltipContent({ text }: BuilderTooltipContentProps) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return null
  }

  type Segment = { type: 'text' | 'list'; lines: string[] }

  const segments = lines.reduce<Segment[]>((acc, rawLine) => {
    const isBullet = rawLine.startsWith('•')
    const content = isBullet ? rawLine.slice(1).trimStart() : rawLine
    if (content.length === 0) {
      return acc
    }
    const last = acc[acc.length - 1]
    const type = isBullet ? 'list' : 'text'
    if (last && last.type === type) {
      last.lines.push(content)
      return acc
    }
    return [...acc, { type, lines: [content] }]
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {segments.map((segment, segmentIdx) => {
        if (segment.type === 'text') {
          return segment.lines.map((line, lineIdx) => (
            <Typography variant="body2" key={`text-${segmentIdx}-${lineIdx}`}>
              {line}
            </Typography>
          ))
        }
        return (
          <Box
            component="ul"
            key={`list-${segmentIdx}`}
            sx={{
              pl: 2,
              m: 0,
              listStyleType: 'disc',
              listStylePosition: 'outside',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            {segment.lines.map((line, lineIdx) => (
              <Box component="li" key={`list-${segmentIdx}-${lineIdx}`} sx={{ p: 0 }}>
                <Typography component="span" variant="body2">
                  {line}
                </Typography>
              </Box>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
