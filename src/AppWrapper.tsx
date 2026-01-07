import { GlobalProvider } from 'qapp-core';
import Layout from './styles/Layout';
import { publicSalt } from './qapp-config';

export const AppWrapper = () => {

  return (
    <GlobalProvider
      config={{
        appName: 'Subscriptions',
        auth: {
          balanceSetting: {
            interval: 180000,
            onlyOnMount: false,
          },
          authenticateOnMount: true,
        },
        publicSalt: publicSalt,
      }}
    >
      <Layout />
    </GlobalProvider>
  );
};
