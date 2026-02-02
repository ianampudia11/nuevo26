import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { StorageUsage } from '@/utils/storage';

/**
 * Hook to fetch company usage data (admin only)
 */
export function useCompanyUsage(companyId: number) {
  return useQuery<StorageUsage>({
    queryKey: ['company-usage', companyId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/companies/${companyId}/usage`);
      if (!response.ok) {
        throw new Error('Failed to fetch company usage data');
      }
      return response.json();
    },
    enabled: !!companyId,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
}

/**
 * Hook to update company usage (internal system use)
 */
export function useUpdateCompanyUsage(companyId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (usageData: {
      storageUsed?: number;
      bandwidthUsed?: number;
      filesCount?: number;
    }) => {
      const response = await apiRequest('POST', `/api/admin/companies/${companyId}/usage/update`, usageData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update usage');
      }

      return response.json();
    },
    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ['company-usage', companyId] });
    },
  });
}

/**
 * Hook to override company usage (admin only)
 */
export function useOverrideCompanyUsage(companyId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (overrideData: {
      currentStorageUsed?: number;
      currentBandwidthUsed?: number;
      filesCount?: number;
      reason?: string;
    }) => {
      const response = await apiRequest('POST', `/api/admin/companies/${companyId}/usage/override`, overrideData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to override usage');
      }

      return response.json();
    },
    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ['company-usage', companyId] });
    },
  });
}

/**
 * Hook to reset monthly bandwidth usage (admin only)
 */
export function useResetBandwidthUsage(companyId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/companies/${companyId}/usage/reset-bandwidth`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset bandwidth usage');
      }

      return response.json();
    },
    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ['company-usage', companyId] });
    },
  });
}

/**
 * Hook to get multiple companies usage data (admin dashboard)
 */
export function useCompaniesUsageOverview() {
  return useQuery<StorageUsage[]>({
    queryKey: ['companies-usage-overview'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/companies/usage/overview');
      if (!response.ok) {
        throw new Error('Failed to fetch companies usage overview');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Hook to get usage history/trends (if implemented)
 */
export function useCompanyUsageHistory(companyId: number, days: number = 30) {
  return useQuery({
    queryKey: ['company-usage-history', companyId, days],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/companies/${companyId}/usage/history?days=${days}`);
      if (!response.ok) {
        throw new Error('Failed to fetch usage history');
      }
      return response.json();
    },
    enabled: !!companyId,
  });
}

/**
 * Utility hook to check if usage limits are being approached
 */
export function useUsageAlerts(companyId: number) {
  const { data: usage } = useCompanyUsage(companyId);

  const alerts = [];

  if (usage) {
    if (usage.status.storageExceeded) {
      alerts.push({
        type: 'error',
        message: 'Storage limit exceeded',
        action: 'Upgrade plan or free up space'
      });
    } else if (usage.status.storageNearLimit) {
      alerts.push({
        type: 'warning',
        message: 'Storage limit approaching',
        action: 'Consider upgrading plan'
      });
    }

    if (usage.status.bandwidthExceeded) {
      alerts.push({
        type: 'error',
        message: 'Bandwidth limit exceeded',
        action: 'Upgrade plan for more bandwidth'
      });
    } else if (usage.status.bandwidthNearLimit) {
      alerts.push({
        type: 'warning',
        message: 'Bandwidth limit approaching',
        action: 'Monitor usage carefully'
      });
    }

    if (usage.status.filesExceeded) {
      alerts.push({
        type: 'error',
        message: 'File count limit exceeded',
        action: 'Delete files or upgrade plan'
      });
    } else if (usage.status.filesNearLimit) {
      alerts.push({
        type: 'warning',
        message: 'File count limit approaching',
        action: 'Consider cleaning up files'
      });
    }
  }

  return alerts;
}

/**
 * Hook to trigger manual usage recalculation (admin only)
 */
export function useRecalculateCompanyUsage(companyId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/companies/${companyId}/usage/recalculate`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to recalculate usage');
      }

      return response.json();
    },
    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ['company-usage', companyId] });
    },
  });
}