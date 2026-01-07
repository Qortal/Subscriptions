import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { RequestQueueWithPromise } from 'qapp-core';
import { addressNamesAtom } from '../state/addressNames';

const nameRequestQueue = new RequestQueueWithPromise(3); // Max 3 concurrent requests

export function useFetchPrimaryNames(addresses: string[]) {
  const [addressNames, setAddressNames] = useAtom(addressNamesAtom);

  useEffect(() => {
    // Filter out addresses we already have names for
    const addressesToFetch = addresses.filter(
      (address) => !addressNames.has(address)
    );

    if (addressesToFetch.length === 0) return;

    // Fetch primary names for addresses we don't have yet
    addressesToFetch.forEach((address) => {
      nameRequestQueue.enqueue(async () => {
        try {
          const res = await fetch(`/names/primary/${address}`);
          
          if (res.ok) {
            const data = await res.json();
            if (data?.name) {
              setAddressNames((prev) => {
                const newMap = new Map(prev);
                newMap.set(address, data.name);
                return newMap;
              });
            }
          }
        } catch (e) {
          // Silently fail - we'll just show the address
          console.error(`Failed to fetch name for ${address}:`, e);
        }
      });
    });
  }, [addresses, addressNames, setAddressNames]);

  return addressNames;
}

export function useGetDisplayName() {
  const [addressNames] = useAtom(addressNamesAtom);

  return (address: string): string => {
    return addressNames.get(address) || address;
  };
}

