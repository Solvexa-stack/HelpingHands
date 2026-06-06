'use client';

import { useState } from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, send to API
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Contact Us</h1>
          <p className="text-gray-500 text-lg">Get in touch with our team</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact info */}
          <div className="space-y-5">
            {[
              { icon: Mail, title: 'Email', value: 'info@helpinghands.org' },
              { icon: Phone, title: 'Phone', value: '+1 (555) 000-0000' },
              { icon: MapPin, title: 'Address', value: '123 Charity Lane, Hope City, HC 10001' },
            ].map(({ icon: Icon, title, value }) => (
              <div key={title} className="card p-5 flex items-start gap-4">
                <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{title}</p>
                  <p className="text-gray-500 text-sm mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="lg:col-span-2 card p-8">
            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-500">Thank you for reaching out. We'll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="label">Your Name</label>
                    <input type="text" required className="input" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ali Hassan" />
                  </div>
                  <div>
                    <label className="label">Email Address</label>
                    <input type="email" required className="input" value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ali@example.com" />
                  </div>
                </div>
                <div>
                  <label className="label">Subject</label>
                  <input type="text" required className="input" value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="How can we help?" />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea required rows={5} className="input resize-none" value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us more..." />
                </div>
                <button type="submit" className="btn-primary gap-2">
                  <Send className="w-4 h-4" /> Send Message
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
