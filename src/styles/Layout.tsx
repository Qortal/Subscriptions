import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Toolbar,
  Typography,
} from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import { useGlobal } from 'qapp-core';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useIframe } from '../hooks/useIframeListener';
import { useCacheCleanup } from '../hooks/useCacheCleanup';

const Layout = () => {
  useIframe();
  useCacheCleanup(); // Automatically clean up confirmed transactions from cache
  const navigate = useNavigate();
  const { auth } = useGlobal();
  const { t } = useTranslation(['core']);

  return (
    <Box
      sx={(theme) => ({
        minHeight: '100vh',
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.primary,
      })}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={(theme) => ({
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(14, 15, 20, 0.92)'
              : 'rgba(246, 242, 234, 0.86)',
          backdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${theme.palette.border.subtle}`,
          color: theme.palette.text.primary,
        })}
      >
        <Toolbar
          sx={{
            minHeight: { xs: 56, sm: 60 },
            px: { xs: 2, sm: 3 },
            gap: 1.5,
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={() => navigate('/')}
            sx={(theme) => ({
              alignItems: 'center',
              background: 'transparent',
              border: 0,
              color: theme.palette.text.primary,
              cursor: 'pointer',
              display: 'flex',
              gap: 1,
              minWidth: 0,
              p: 0,
            })}
          >
            <Box
              sx={(theme) => ({
                alignItems: 'center',
                backgroundColor: theme.palette.background.surface,
                border: `1px solid ${theme.palette.border.subtle}`,
                borderRadius: '8px',
                display: 'flex',
                height: 34,
                justifyContent: 'center',
                width: 34,
              })}
            >
              <HomeRoundedIcon sx={{ fontSize: 19 }} />
            </Box>
            <Typography
              variant="h6"
              fontWeight={900}
              sx={{
                fontSize: 16,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('core:app_subscriptions')}
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            color="inherit"
            startIcon={<HomeRoundedIcon />}
            onClick={() => navigate('/')}
            sx={(theme) => ({
              backgroundColor: theme.palette.background.surface,
              border: `1px solid ${theme.palette.border.subtle}`,
              color: theme.palette.text.primary,
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
                borderColor: theme.palette.border.main,
              },
            })}
          >
            {t('core:app_home')}
          </Button>

          <Chip
            label={auth?.name ?? t('core:app_guest')}
            size="small"
            variant="outlined"
            sx={{
              maxWidth: { xs: 150, sm: 240 },
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            }}
          />
        </Toolbar>
      </AppBar>

      <Box component="main">
        <Container
          maxWidth="lg"
          sx={{
            px: { xs: 1.5, sm: 3 },
            py: { xs: 2, sm: 3 },
          }}
        >
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
};

export default Layout;
