import { useEffect, useState } from 'react';

export type JoinRequest = {
  joiner: string;
  groupId: number;
  reference: string;
};

/**
 * Hook to fetch pending join requests for a group
 */
export function useGroupJoinRequests(groupId: number | null) {
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupId === null) {
      setJoinRequests([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchJoinRequests() {
      setLoading(true);
      setError(null);

      try {
        // Try the most likely endpoint based on Qortal API patterns
        const res = await fetch(`/groups/joinrequests/${groupId}`);
        
        if (!res.ok) {
          if (res.status === 404) {
            // No join requests found
            if (!cancelled) {
              setJoinRequests([]);
            }
            return;
          }
          throw new Error(`Failed to fetch join requests: ${res.statusText}`);
        }

        const data = await res.json();
        const requests = Array.isArray(data) ? data : [];

        if (!cancelled) {
          setJoinRequests(requests);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to fetch join requests');
          setJoinRequests([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchJoinRequests();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return {
    joinRequests,
    loading,
    error,
  };
}

