import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';

type JoinRequest = {
  groupId: number;
  joiner: string;
};

export function useJoinRequestGroups() {
  const { auth } = useGlobal();
  const [loading, setLoading] = useState(false);
  const [joinRequestGroupIds, setJoinRequestGroupIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const address = auth?.address;
        if (!address) {
          if (!cancelled) {
            setJoinRequestGroupIds([]);
            setError('No authenticated address available to load join requests');
          }
          return;
        }

        const response = await fetch(`/groups/joinrequests/address/${address}`);
        if (!response.ok) {
          if (!cancelled) {
            if (response.status === 404) {
              setJoinRequestGroupIds([]);
              return;
            }
            setError(`Failed to load join requests (${response.status})`);
            setJoinRequestGroupIds([]);
          }
          return;
        }

        const data: JoinRequest[] = await response.json();
        const groupIds = Array.isArray(data) 
          ? data.map(request => request.groupId).filter(id => typeof id === 'number')
          : [];
        
        if (!cancelled) setJoinRequestGroupIds(groupIds);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load join requests');
          setJoinRequestGroupIds([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [auth?.address]);

  return { joinRequestGroupIds, loading, error };
}

