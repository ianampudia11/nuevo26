import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {

    const clonedRes = res.clone();
    let errorMessage = res.statusText;
    
    try {

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const jsonData = await clonedRes.json();

        if (jsonData.message) {
          errorMessage = jsonData.message;
        } else if (jsonData.error) {
          errorMessage = typeof jsonData.error === 'string' ? jsonData.error : JSON.stringify(jsonData.error);
        }
      } else {

        const text = await clonedRes.text();
        if (text) {
          errorMessage = text;
        }
      }
    } catch (parseError) {

      try {
        const text = await clonedRes.text();
        if (text) {
          errorMessage = text;
        }
      } catch (textError) {

        errorMessage = res.statusText;
      }
    }
    
    const error = new Error(`${res.status}: ${errorMessage}`);
    (error as any).status = res.status;

    if (res.status === 401) {
      (error as any).isAuthError = true;

      (error as any).suppressConsoleError = true;
    }
    
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {

  const isFormData = data instanceof FormData;

  const res = await fetch(url, {
    method,
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }


    if (res.status === 503) {
      try {
        const data = await res.json();
        if (data.maintenanceMode) {

          if (window.location.pathname !== '/maintenance') {
            window.location.href = '/maintenance';
          }
          throw new Error('System is under maintenance');
        }
      } catch (parseError) {

      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
