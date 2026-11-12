import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailX, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../services/api';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>(token ? 'loading' : 'error');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(token ? '' : 'Missing unsubscribe token.');

  useEffect(() => {
    if (!token) return;
    apiRequest<{ message: string; email?: string }>('/api/unsubscribe', {
      method: 'POST',
      body: { token },
    })
      .then(res => {
        setEmail(res.email || '');
        setStatus('done');
      })
      .catch(err => {
        setStatus('error');
        setError(err instanceof ApiError ? err.message : 'Unable to process unsubscribe request.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#150d09] border border-[#38281d] rounded-3xl p-8 text-center space-y-5 shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-[#251a13] border border-[#dfc471]/30 flex items-center justify-center mx-auto text-[#dfc471]">
          {status === 'done' ? <CheckCircle2 className="w-7 h-7 text-emerald-400" /> : status === 'error' ? <AlertCircle className="w-7 h-7 text-red-400" /> : <MailX className="w-7 h-7" />}
        </div>

        <h1 className="font-serif text-2xl text-[#f9f6f2]">
          {status === 'loading'
            ? 'Updating Preferences...'
            : status === 'done'
            ? 'Unsubscribed from Marketing Emails'
            : 'Unsubscribe Link Issue'}
        </h1>

        {status === 'done' && (
          <p className="text-xs sm:text-sm text-[#d5c4b4]/80 leading-relaxed">
            {email ? `(${email}) ` : ''}You have been unsubscribed from promotional, festival, and product announcement emails. Essential transactional order &amp; security emails remain active.
          </p>
        )}

        {status === 'error' && <p className="text-xs sm:text-sm text-red-300">{error}</p>}

        <div className="pt-2 flex flex-col gap-2.5">
          <Link
            to="/account?tab=preferences"
            className="py-3 px-5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805]"
          >
            Manage Email Preferences
          </Link>
          <Link
            to="/"
            className="py-2.5 px-5 rounded-full text-xs font-medium bg-[#251a13] text-[#ede4dc] border border-[#38281d]"
          >
            Return to Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}

