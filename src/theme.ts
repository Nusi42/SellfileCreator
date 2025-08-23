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
  },
})

export default theme

