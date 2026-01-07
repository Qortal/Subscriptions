import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppWrapper } from '../AppWrapper';
import { HomePage } from '../pages/HomePage';
import { SubscriptionPage } from '../pages/SubscriptionPage';
import { ManageSubscriptionPage } from '../pages/ManageSubscriptionPage';
import { CreateSubscriptionPage } from '../pages/CreateSubscriptionPage';

interface CustomWindow extends Window {
  _qdnBase: string;
}
const customWindow = window as unknown as CustomWindow;
const baseUrl = customWindow?._qdnBase || '';

export function Routes() {
  const router = createBrowserRouter(
    [
      {
        path: '/',
        element: <AppWrapper />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: 'create',
            element: <CreateSubscriptionPage />,
          },
          {
            path: 'subscription/:subscriptionId',
            element: <SubscriptionPage />,
          },
          {
            path: 'manage/:groupId',
            element: <ManageSubscriptionPage />,
          },
        ],
      },
    ],
    {
      basename: baseUrl,
    }
  );

  return <RouterProvider router={router} />;
}
