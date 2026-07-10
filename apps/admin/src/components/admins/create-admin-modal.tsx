'use client';

import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLanguage } from '@/contexts/language-context';

function createSchema(passwordHint: string) {
  return z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, passwordHint),
    role: z.enum(['administrator', 'employee', 'financial_officer']),
  });
}

type FormData = z.infer<ReturnType<typeof createSchema>>;

interface Props {
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  loading?: boolean;
}

export function CreateAdminModal({ onClose, onSubmit, loading }: Props) {
  const { t } = useLanguage();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(createSchema(t('employees.passwordHint'))),
    defaultValues: { role: 'employee' },
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('employees.createTitle')}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('employees.firstName')}</label>
              <input {...register('firstName')} className="input" placeholder="John" />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">{t('employees.lastName')}</label>
              <input {...register('lastName')} className="input" placeholder="Smith" />
            </div>
          </div>
          <div>
            <label className="label">{t('employees.email')}</label>
            <input {...register('email')} type="email" className="input" placeholder="john@helpinghands.org" />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">{t('employees.password')}</label>
            <input {...register('password')} type="password" className="input" placeholder="••••••••" />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label className="label">{t('employees.role')}</label>
            <select {...register('role')} className="input">
              <option value="employee">{t('roles.employee')}</option>
              <option value="financial_officer">{t('roles.financial_officer')}</option>
              <option value="administrator">{t('roles.administrator')}</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary btn-md">{t('employees.cancel')}</button>
            <button type="submit" disabled={loading} className="flex-1 btn-primary btn-md">
              {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : t('employees.createAccount')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
