import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { useGlobal } from 'qapp-core';
import { Outlet, useNavigate } from 'react-router-dom';
import { useIframe } from '../hooks/useIframeListener';

const Layout = () => {
  useIframe();
  const navigate = useNavigate();
  const { auth } = useGlobal();

  return (
    <>
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            fontWeight={900}
            sx={{ cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            Subscriptions
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <Button color="inherit" onClick={() => navigate('/')}>
            Home
          </Button>

          <Typography variant="body2" sx={{ ml: 2, opacity: 0.8 }}>
            {auth?.name ?? 'Guest'}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box component="main">
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Outlet /> {/* This is where page content will be rendered */}
        </Container>
      </Box>
    </>
  );
};

export default Layout;
