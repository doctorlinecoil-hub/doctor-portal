'use client';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import Icon from './Icon';

export default function LogoutButton() {
  const supabase = useSupabase();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await supabase.auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      <Icon name="logout" />יציאה
    </button>
  );
}
