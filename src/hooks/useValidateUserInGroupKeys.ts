import { useEffect, useState } from 'react';

// @ts-ignore - qortalRequest is available globally
declare const qortalRequest: (params: any) => Promise<any>;

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

export async function getNameInfo(address: string) {
  const response = await fetch(`/names/primary/` + address);
  const nameData = await response.json();

  if (nameData?.name) {
    return nameData?.name;
  } else {
    return '';
  }
}

export const getGroupAdmins = async (groupNumber: number) => {
  const response = await fetch(
    `/groups/members/${groupNumber}?limit=0&onlyAdmins=true`
  );
  const groupData = await response.json();
  const members: any[] = [];
  const membersAddresses: any[] = [];
  const both: any[] = [];

  const getMemNames = groupData?.members?.map(async (member: any) => {
    if (member?.member) {
      const name = await getNameInfo(member.member);
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

export const useValidateUserInGroupKeys = (groupId: number) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isInGroupKeys, setIsInGroupKeys] = useState(false);
  useEffect(() => {
    if (!groupId) return;

    async function fetchData() {
      setIsLoading(true);
      try {
        const { names } = await getGroupAdmins(groupId);

        if (!names.length) {
          return;
        }
        const publish = await getPublishesFromAdmins(names, groupId);

        if (publish === false) {
          setIsInGroupKeys(false);
          setIsLoading(false);
          return;
        }

        const res = await fetch(
          `/arbitrary/DOCUMENT_PRIVATE/${publish.name}/${
            publish.identifier
          }?encoding=base64`
        );

        const data = await res.text();

        await qortalRequest({
          action: 'DECRYPT_DATA',
          encryptedData: data,
        });
        setIsLoading(false);
        setIsInGroupKeys(true);
      } catch (error) {
        setIsInGroupKeys(false);
        setIsLoading(false);
      }
    }

    fetchData();

    // TODO: Implement group keys validation logic
  }, [groupId]);

  return {
    isInGroupKeys,
    isLoading,
  };
};
