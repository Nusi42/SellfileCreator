import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#58a6ff',
    },
    background: {
      default: '#0f1216',
      paper: '#161b22',
    },
    divider: '#30363d',
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { variant: 'contained' },
    },
    MuiPaper: {
      styleOverrides: {
        root: { border: '1px solid #30363d' },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
        placement: 'top-start',
        // Do not follow cursor globally; we enable it explicitly only where needed.
        slotProps: { popper: { modifiers: [{ name: 'offset', options: { offset: [0, 8] } }] } },
      },
      styleOverrides: {
        tooltip: {
          fontSize: '12px',
        },
      },
    },
  },
})

export default theme
