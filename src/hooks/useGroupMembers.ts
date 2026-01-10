import { useEffect, useState } from 'react';

export type GroupMember = {
  member: string;
  joined: number;
  isAdmin?: boolean;
};

export type GroupMembersResponse = {
  memberCount: number;
  adminCount: number;
  members: GroupMember[];
};

export function useGroupMembers(groupId: number | null, limit: number = 100, refreshKey: number = 0) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupId === null) return;

    let cancelled = false;

    async function fetchMembers() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/groups/members/${groupId}?limit=${limit}&reverse=true`);
        
        if (!res.ok) {
          throw new Error(`Failed to fetch members: ${res.statusText}`);
        }

        const data: GroupMembersResponse = await res.json();

        if (!cancelled) {
          setMembers(data.members || []);
          setMemberCount(data.memberCount || 0);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to fetch group members');
          setMembers([]);
          setMemberCount(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMembers();

    return () => {
      cancelled = true;
    };
  }, [groupId, limit, refreshKey]);

  return {
    members,
    memberCount,
    loading,
    error,
  };
}

