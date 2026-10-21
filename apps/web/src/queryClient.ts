import { QueryClient } from '@tanstack/react-query';
import { ErroreHttp } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (n, err) => !(err instanceof ErroreHttp && err.status >= 400 && err.status < 500) && n < 2,
    },
  },
});
