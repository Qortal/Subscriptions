import { useEffect, useState } from 'react';

type GroupInfo = {
  groupId: number;
  groupName: string;
  description?: string;
  owner?: string;
  [key: string]: any;
};

/**
 * Hook to fetch group information by groupId
 */
export function useGroupInfo(groupId: number | null) {
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupId === null) {
      setGroupInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchGroupInfo() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/groups/${groupId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch group: ${response.statusText}`);
        }

        const data = await response.json();

        if (!cancelled) {
          setGroupInfo(data);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to fetch group information');
          setGroupInfo(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchGroupInfo();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return {
    groupInfo,
    groupName: groupInfo?.groupName ?? null,
    loading,
    error,
  };
}

