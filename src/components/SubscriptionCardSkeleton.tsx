import { Box, Card, CardActions, CardContent, Skeleton, Stack } from '@mui/material';

export function SubscriptionCardSkeleton(props: {
  titleWidth?: number;
  subtitleWidth?: number;
  actionWidth?: number;
}) {
  const { titleWidth = 240, subtitleWidth = 180, actionWidth = 150 } = props;

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
            <Skeleton variant="text" width={titleWidth} height={28} />
            <Skeleton variant="text" width={subtitleWidth} height={22} />
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Skeleton variant="rounded" width={90} height={28} />
            <Skeleton variant="rounded" width={150} height={28} />
            <Skeleton variant="rounded" width={150} height={28} />
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Skeleton variant="rounded" width={actionWidth} height={36} />
      </CardActions>
    </Card>
  );
}

