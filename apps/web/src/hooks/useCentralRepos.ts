import { useQuery } from '@tanstack/react-query';
import { CentralReposClient } from '@codepods/sdk';
import type { DiscoveredTemplate, DiscoveredProvider } from '@codepods/shared-types';

export const centralReposClient = new CentralReposClient('/api');

export function useDiscoveredTemplates() {
  return useQuery<DiscoveredTemplate[]>({
    queryKey: ['discovered-templates'],
    queryFn: () => centralReposClient.discoverTemplates(),
    staleTime: 60_000,
  });
}

export function useDiscoveredProviders() {
  return useQuery<DiscoveredProvider[]>({
    queryKey: ['discovered-providers'],
    queryFn: () => centralReposClient.discoverProviders(),
    staleTime: 60_000,
  });
}
