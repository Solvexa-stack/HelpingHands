'use client';

import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  password: z.string().optional().refine(
    (v) => !v || (v.length >= 8 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(v)),
    { message: 'Must be at least 8 chars with uppercase, lowercase, number & special char' },
  ),
  role: z.enum(['administrator', 'employee', 'financial_officer']),
});

type FormData = z.infer<typeof schema>;

interface Admin {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  user?: { email?: string };
}

interface Props {
  admin: Admin;
  onClose: () => void;
  onSubmit: (id: number, data: Partial<FormData>) => void;
  loading?: boolean;
}

export function EditAdminModal({ admin, onClose, onSubmit, loading }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.user?.email || '',
      password: '',
      role: admin.role as FormData['role'],
    },
  });

  const submit = (data: FormData) => {
    const payload: Partial<FormData> = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
    };
    if (data.password) payload.password = data.password;
    onSubmit(admin.id, payload);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Edit Team Member</h2>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(submit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input {...register('firstName')} className="input" />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last Name</label>
              <input {...register('lastName')} className="input" />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input {...register('email')} type="email" className="input" />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
            <input {...register('password')} type="password" className="input" placeholder="••••••••" />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label className="label">Role</label>
            <select {...register('role')} className="input">
              <option value="employee">Employee</option>
              <option value="financial_officer">Financial Officer</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary btn-md">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 btn-primary btn-md">
              {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
