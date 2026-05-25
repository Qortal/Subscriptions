import './theme-augmentation';
import { createTheme, alpha, type ThemeOptions } from '@mui/material/styles';
import {
  APP_BLUE,
  APP_BLUE_SURFACE_TEXT,
  getBlueTier1ButtonSx,
} from './blueMaterial';

const getGlobalStyles = (mode: 'light' | 'dark') => {
  const isDark = mode === 'dark';
  const background = isDark ? '#0E0F14' : '#DDD6CA';
  const top = isDark ? '#0E0F14' : '#EEE7DC';

  return {
    ':root': {
      '--bg-primary': background,
      '--bg-2': top,
      '--primary-main': APP_BLUE.primary,
    },
    '*, *::before, *::after': {
      boxSizing: 'border-box',
    },
    html: {
      backgroundColor: background,
      backgroundImage: `linear-gradient(180deg, ${top} 0%, ${background} 100%)`,
      backgroundRepeat: 'no-repeat',
      minHeight: '100%',
      padding: 0,
      margin: 0,
    },
    body: {
      backgroundColor: background,
      backgroundImage: `linear-gradient(180deg, ${top} 0%, ${background} 100%)`,
      backgroundRepeat: 'no-repeat',
      color: isDark ? 'rgb(244, 247, 251)' : 'rgba(21, 26, 35, 0.94)',
      fontSynthesis: 'none',
      margin: 0,
      minHeight: '100%',
      padding: 0,
      textRendering: 'geometricPrecision',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      wordBreak: 'break-word',
    },
    '#root': {
      minHeight: '100vh',
    },
    '::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
    },
    '::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.14)',
      borderRadius: '999px',
      border: '2px solid transparent',
      backgroundClip: 'content-box',
    },
    '::-webkit-scrollbar-thumb:hover': {
      backgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.18)'
        : 'rgba(0, 0, 0, 0.2)',
    },
  };
};

const commonThemeOptions: ThemeOptions = {
  typography: {
    fontFamily: [
      'Inter',
      'Segoe UI',
      'ui-sans-serif',
      'system-ui',
      'sans-serif',
    ].join(','),
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: 0 },
    h2: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: 0 },
    h3: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: 0 },
    h4: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: 0 },
    h5: { fontSize: '1rem', fontWeight: 700, letterSpacing: 0 },
    h6: { fontSize: '0.875rem', fontWeight: 700, letterSpacing: 0 },
    body1: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
    },
    body2: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    button: {
      fontWeight: 700,
      letterSpacing: 0,
      textTransform: 'none',
    },
  },
  spacing: 8,
  shape: {
    borderRadius: 4,
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          borderRadius: '8px',
          minHeight: '34px',
          transition:
            'background 180ms ease, box-shadow 180ms ease, border-color 180ms ease, color 180ms ease, filter 180ms ease, transform 180ms ease',
        },
      },
      variants: [
        {
          props: { variant: 'contained', color: 'primary' },
          style: {
            ...getBlueTier1ButtonSx(),
            color: APP_BLUE_SURFACE_TEXT,
          },
        },
      ],
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
          border: `1px solid ${theme.palette.border.subtle}`,
          borderRadius: '8px',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 8px 18px rgba(0, 0, 0, 0.12)'
              : '0 12px 28px rgba(44, 38, 28, 0.07)',
          color: theme.palette.text.primary,
          transition:
            'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
        }),
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
          color: theme.palette.text.primary,
        }),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
          border: `1px solid ${theme.palette.border.subtle}`,
          borderRadius: '8px',
          color: theme.palette.text.primary,
        }),
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '20px 24px 12px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 24px 20px',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          borderRadius: '8px',
          minHeight: '42px',
          padding: '4px',
        }),
        indicator: {
          display: 'none',
        },
        flexContainer: {
          gap: '4px',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: '6px',
          color: theme.palette.text.secondary,
          fontSize: '14px',
          fontWeight: 600,
          minHeight: '34px',
          padding: '8px 16px',
          textTransform: 'none',
          transition: 'all 0.2s ease',
          '&.Mui-selected': {
            backgroundColor: theme.palette.background.default,
            color: theme.palette.text.primary,
          },
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
          },
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: '7px',
          fontWeight: 700,
          maxWidth: '100%',
          '&.MuiChip-outlined': {
            backgroundColor: alpha(theme.palette.background.surface, 0.72),
            borderColor: theme.palette.border.subtle,
          },
        }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundImage: 'none',
          border: `1px solid ${theme.palette.border.subtle}`,
          borderRadius: '8px',
        }),
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.surface,
          borderRadius: '8px',
          '& fieldset': {
            borderColor: theme.palette.border.subtle,
          },
          '&:hover fieldset': {
            borderColor: theme.palette.border.main,
          },
          '&.Mui-focused fieldset': {
            borderColor: theme.palette.primary.main,
          },
        }),
      },
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderBottom: `1px solid ${theme.palette.border.subtle}`,
          color: theme.palette.text.primary,
        }),
        head: ({ theme }) => ({
          color: theme.palette.text.secondary,
          fontSize: '12px',
          fontWeight: 800,
        }),
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: ({ theme }) => ({
          color: theme.palette.text.secondary,
          fontSize: '13px',
          fontWeight: 700,
          '&.Mui-active, &.Mui-completed': {
            color: theme.palette.text.primary,
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: '8px',
          color: theme.palette.text.secondary,
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary,
          },
        }),
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: getGlobalStyles('light'),
    },
  },
};

const lightTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: 'light',
    primary: {
      main: APP_BLUE.primary,
      dark: APP_BLUE.pressed,
      light: APP_BLUE.gradientTop,
    },
    secondary: {
      main: APP_BLUE.hover,
    },
    background: {
      default: '#DDD6CA',
      surface: '#EEE7DC',
      paper: '#F6F2EA',
      elevated: '#E2D9CB',
    },
    text: {
      primary: 'rgba(21, 26, 35, 0.94)',
      secondary: 'rgba(88, 96, 110, 0.86)',
    },
    divider: 'rgba(28, 36, 52, 0.12)',
    action: {
      hover: 'rgba(28, 36, 52, 0.06)',
      selected: 'rgba(41, 121, 218, 0.12)',
      focus: 'rgba(41, 121, 218, 0.14)',
      active: 'rgba(24, 29, 36, 0.86)',
    },
    border: {
      main: 'rgba(28, 36, 52, 0.16)',
      subtle: 'rgba(28, 36, 52, 0.11)',
    },
    other: {
      positive: 'rgb(94, 176, 73)',
      danger: 'rgb(177, 70, 70)',
      unread: 'rgb(66, 151, 226)',
    },
  },
  components: {
    ...commonThemeOptions.components,
    MuiCssBaseline: {
      styleOverrides: getGlobalStyles('light'),
    },
  },
});

const darkTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: 'dark',
    primary: {
      main: APP_BLUE.primary,
      dark: APP_BLUE.pressed,
      light: APP_BLUE.gradientTop,
    },
    secondary: {
      main: APP_BLUE.hover,
    },
    background: {
      default: '#0E0F14',
      surface: '#1B1D24',
      paper: '#1D1F27',
      elevated: '#23262F',
    },
    text: {
      primary: 'rgb(244, 247, 251)',
      secondary: '#989BA7',
    },
    divider: '#23262F',
    action: {
      hover: '#23262F',
      selected: '#262931',
      focus: '#262931',
      active: 'rgba(236, 243, 255, 0.86)',
    },
    border: {
      main: '#30343F',
      subtle: '#23262F',
    },
    other: {
      positive: 'rgb(94, 176, 73)',
      danger: 'rgb(177, 70, 70)',
      unread: 'rgb(66, 151, 226)',
    },
  },
  components: {
    ...commonThemeOptions.components,
    MuiCssBaseline: {
      styleOverrides: getGlobalStyles('dark'),
    },
  },
});

export { lightTheme, darkTheme };
