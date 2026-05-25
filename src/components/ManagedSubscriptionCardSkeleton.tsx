import { Box, Card, CardActions, CardContent, Skeleton, Stack } from '@mui/material';

export function ManagedSubscriptionCardSkeleton() {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        backgroundColor: theme.palette.background.paper,
      })}
    >
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Box>
            <Skeleton variant="text" width={240} height={28} />
            <Skeleton variant="text" width={160} height={22} />
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Skeleton variant="rounded" width={120} height={28} />
            <Skeleton variant="rounded" width={100} height={28} />
            <Skeleton variant="rounded" width={140} height={28} />
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Skeleton variant="rounded" width={110} height={36} />
      </CardActions>
    </Card>
  );
}

