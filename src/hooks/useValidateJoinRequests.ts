import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';

export type JoinRequestValidation = {
  address: string;
  hasPublishedRecord: boolean;
  hasPaid: boolean; // We'll check if PRODUCT record exists
  isValid: boolean; // Both published and paid
};

/**
 * Hook to validate join requests - check if they've published subscription record
 * The PRODUCT record contains the payment transaction signature
 */
export function useValidateJoinRequests(
  addresses: string[],
  detailsIdentifier: string | null
) {
  const { lists } = useGlobal();
  const [validations, setValidations] = useState<Map<string, JoinRequestValidation>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!detailsIdentifier || addresses.length === 0 || !lists?.fetchResourcesResultsOnly) {
      setValidations(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function validateRequests() {
      setLoading(true);

      try {
        const results = await Promise.all(
          addresses.map(async (address) => {
            try {
              // First, try to get primary name for the address
              const nameRes = await fetch(`/names/primary/${address}`);
              let primaryName: string | null = null;
              
              if (nameRes.ok) {
                const nameData = await nameRes.json();
                primaryName = nameData?.name || null;
              }

              // If no primary name, they can't have published anything
              if (!primaryName) {
                return {
                  address,
                  hasPublishedRecord: false,
                  hasPaid: false,
                  isValid: false,
                };
              }

              // Check for PRODUCT record (contains payment signature)
              const resources = await lists.fetchResourcesResultsOnly({
                identifier: detailsIdentifier || '',
                service: 'PRODUCT',
                name: primaryName,
                exactMatchNames: true,
                limit: 1,
              });

              const hasRecord = resources && resources.length > 0;

              return {
                address,
                hasPublishedRecord: hasRecord,
                hasPaid: hasRecord, // If they published the PRODUCT record, it contains payment proof
                isValid: hasRecord,
              };
            } catch (error) {
              console.error(`Failed to validate ${address}:`, error);
              return {
                address,
                hasPublishedRecord: false,
                hasPaid: false,
                isValid: false,
              };
            }
          })
        );

        if (!cancelled) {
          const validationMap = new Map<string, JoinRequestValidation>();
          results.forEach((result) => {
            validationMap.set(result.address, result);
          });
          setValidations(validationMap);
        }
      } catch (error) {
        console.error('Failed to validate join requests:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    validateRequests();

    return () => {
      cancelled = true;
    };
  }, [addresses.join(','), detailsIdentifier, lists]);

  return {
    validations,
    loading,
    getValidation: (address: string) => validations.get(address) || null,
  };
}

