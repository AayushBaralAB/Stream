import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { isLoggedIn } from './auth';

export function useAuthGuard(): { checking: boolean } {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isLoggedIn()) {
      setChecking(false);
    } else {
      router.replace('/auth/login');
    }
  }, [router]);

  return { checking };
}