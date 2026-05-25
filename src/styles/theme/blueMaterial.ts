export const APP_BLUE = {
  primary: '#84AFF0',
  hover: '#6FA3F0',
  pressed: '#5A8FE0',
  gradientTop: '#8FB8F3',
  gradientMid: '#79AAF0',
  gradientBottom: '#6FA3F0',
  gradientHoverTop: '#98BFF6',
  gradientHoverMid: '#83B1F3',
  gradientHoverBottom: '#76A7F1',
  gradientPressedTop: '#7FAEF0',
  gradientPressedBottom: '#6F9FE7',
} as const;

export const APP_BLUE_SURFACE_TEXT = 'rgba(10, 18, 30, 0.92)';

export const getBlueTier1Gradient = (
  state: 'base' | 'hover' | 'pressed' = 'base'
) => {
  if (state === 'hover') {
    return `linear-gradient(180deg, ${APP_BLUE.gradientHoverTop} 0%, ${APP_BLUE.gradientHoverMid} 42%, ${APP_BLUE.gradientHoverBottom} 100%)`;
  }

  if (state === 'pressed') {
    return `linear-gradient(180deg, ${APP_BLUE.gradientPressedTop} 0%, ${APP_BLUE.gradientPressedBottom} 100%)`;
  }

  return `linear-gradient(180deg, ${APP_BLUE.gradientTop} 0%, ${APP_BLUE.gradientMid} 42%, ${APP_BLUE.gradientBottom} 100%)`;
};

export const getBlueTier1Shadow = (
  state: 'base' | 'hover' | 'pressed' = 'base'
) => {
  if (state === 'hover') {
    return '0 8px 22px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.04) inset, 0 0 22px rgba(132, 175, 240, 0.22)';
  }

  if (state === 'pressed') {
    return '0 4px 12px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.02) inset, 0 0 12px rgba(132, 175, 240, 0.14)';
  }

  return '0 6px 18px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.03) inset, 0 0 18px rgba(132, 175, 240, 0.18)';
};

export const getBlueTier1ButtonSx = () => ({
  background: getBlueTier1Gradient('base'),
  border: '1px solid rgba(143, 184, 243, 0.22)',
  boxShadow: getBlueTier1Shadow('base'),
  color: APP_BLUE_SURFACE_TEXT,
  '&:hover': {
    background: getBlueTier1Gradient('hover'),
    boxShadow: getBlueTier1Shadow('hover'),
    filter: 'saturate(1.02)',
  },
  '&:active': {
    background: getBlueTier1Gradient('pressed'),
    boxShadow: getBlueTier1Shadow('pressed'),
    transform: 'translateY(1px)',
  },
  '&:focus-visible': {
    boxShadow:
      '0 0 0 2px rgba(132, 175, 240, 0.28), 0 6px 18px rgba(0, 0, 0, 0.28), 0 0 18px rgba(132, 175, 240, 0.18)',
    outline: 'none',
  },
});
