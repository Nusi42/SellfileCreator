import { MENU_LABEL_WIDTH_PX } from '../lib/constants'

export const HEADER_MENU_LABEL_SX = {
  width: MENU_LABEL_WIDTH_PX,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
  lineHeight: 1.15,
  whiteSpace: 'normal',
} as const
