import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { pendingOwnerActionsAtom } from '../lib/pendingTransactionsCache';

export function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
const getPublishesFromAdmins = async (admins: string[], groupId: number) => {
  const queryString = admins.map((name) => `name=${name}`).join('&');
  const url = `/arbitrary/resources/searchsimple?mode=ALL&service=DOCUMENT_PRIVATE&identifier=symmetric-qchat-group-${
    groupId
  }&exactmatchnames=true&limit=0&reverse=true&${queryString}&prefix=true`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('network error');
  }
  const adminData = await response.json();

  const filterId = adminData.filter(
    (data: any) => data.identifier === `symmetric-qchat-group-${groupId}`
  );

  if (filterId?.length === 0) {
    return false;
  }

  const sortedData = filterId.sort((a: any, b: any) => {
    // Get the most recent date for both a and b
    const dateA = a.updated ? new Date(a.updated) : new Date(a.created);
    const dateB = b.updated ? new Date(b.updated) : new Date(b.created);

    // Sort by most recent
    return dateB.getTime() - dateA.getTime();
  });

  return sortedData[0];
};

export const getGroupAdmins = async (groupNumber: number) => {
  const response = await fetch(
    `/groups/members/${groupNumber}?limit=0&onlyAdmins=true`
  );
  const groupData = await response.json();
  const members: string[] = [];
  const membersAddresses: string[] = [];
  const both: Array<{ name: string; address: string }> = [];

  const getMemNames = groupData?.members?.map(async (member: any) => {
    if (member?.member) {
      const name = member.primaryName;
      if (name) {
        members.push(name);
        both.push({ name, address: member.member });
      }
      membersAddresses.push(member.member);
    }

    return true;
  });
  await Promise.all(getMemNames);

  return { names: members, addresses: membersAddresses, both };
};

export const getGroupMembers = async (groupNumber: number) => {
  // const validApi = await findUsableApi();

  const response = await fetch(`/groups/members/${groupNumber}?limit=0`);
  const groupData = await response.json();
  return groupData;
};

export const useValidateGroupKeys = (
  groupId: number,
  refreshKey: number = 0
) => {
  const [triedToFetchSecretKey, setTriedToFetchSecretKey] = useState(false);
  const [secretKeyPublishDate, setSecretKeyPublishDate] = useState<
    number | null
  >(null);
  const [memberCountFromSecretKeyData, setMemberCountFromSecretKeyData] =
    useState<number | null>(null);
  const [newEncryptionNotification] = useState<any | null>(null);
  const [members, setMembers] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get pending owner actions from cache to check for recent re-encryption
  const pendingOwnerActions = useAtomValue(pendingOwnerActionsAtom);

  useEffect(() => {
    if (!groupId) return;
    async function fetchData() {
      setIsLoading(true);
      try {
        const memberData = await getGroupMembers(groupId);
        setMembers(memberData);

        const { names } = await getGroupAdmins(groupId);

        if (!names.length) {
          return;
        }
        const publish = await getPublishesFromAdmins(names, groupId);
        setSecretKeyPublishDate(publish.updated || publish.created);
        if (publish === false) {
          setTriedToFetchSecretKey(true);
          setIsLoading(false);
          return;
        }
        setTriedToFetchSecretKey(true);
        const res = await fetch(
          `/arbitrary/DOCUMENT_PRIVATE/${publish.name}/${
            publish.identifier
          }?encoding=base64`
        );

        const data = await res.text();
        const allCombined = base64ToUint8Array(data);

        // Extract the nonce
        // Extract the shared keyNonce

        // Extract the sender's public key

        // Calculate count first
        const countStartPosition = allCombined.length - 4; // 4 bytes before the end, since count is stored in Uint32 (4 bytes)
        const countArray = allCombined.slice(
          countStartPosition,
          countStartPosition + 4
        );
        const count = new Uint32Array(countArray.buffer)[0];

        setMemberCountFromSecretKeyData(count);
        setIsLoading(false);
      } catch (error) {}
    }

    fetchData();

    // TODO: Implement group keys validation logic
  }, [groupId, refreshKey]);

  const shouldReEncrypt = useMemo(() => {
    if (isLoading) return false;

    // Check for recent re-encryption in cache (2-minute window)
    const recentReEncrypt = pendingOwnerActions.find(
      (action) =>
        action.type === 're-encrypt' &&
        action.groupId === groupId &&
        action.expiresAt > Date.now()
    );

    // If there's a recent re-encryption action in cache, don't show alert/button
    if (recentReEncrypt) {
      return false;
    }

    // Re-encryption check based purely on blockchain state (no cache involved)
    if (triedToFetchSecretKey && !secretKeyPublishDate) return true;
    if (
      !secretKeyPublishDate ||
      !memberCountFromSecretKeyData ||
      members?.length === 0
    )
      return false;
    const isDiffMemberNumber =
      memberCountFromSecretKeyData !== members?.memberCount;

    if (isDiffMemberNumber) return true;

    const latestJoined = members?.members.reduce(
      (maxJoined: number, current: any) => {
        return current.joined > maxJoined ? current.joined : maxJoined;
      },
      members?.members[0].joined
    );

    if (secretKeyPublishDate < latestJoined) {
      return true;
    }
    return false;
  }, [
    memberCountFromSecretKeyData,
    members,
    secretKeyPublishDate,
    newEncryptionNotification,
    triedToFetchSecretKey,
    isLoading,
    pendingOwnerActions,
    groupId,
  ]);

  return shouldReEncrypt;
};
