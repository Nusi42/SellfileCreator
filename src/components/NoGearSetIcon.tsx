import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'

type NoGearSetIconProps = {
  fontSize?: 'inherit' | 'small' | 'medium' | 'large'
}

export function NoGearSetIcon({ fontSize = 'small' }: NoGearSetIconProps) {
  // Use a universal "not allowed" glyph so "No Gear-Set" is recognizable at a glance.
  return <BlockOutlinedIcon fontSize={fontSize} />
}
