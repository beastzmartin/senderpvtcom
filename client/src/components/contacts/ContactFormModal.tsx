import React, { useState, useEffect } from 'react';
import { Contact } from '../../types';
import { api } from '../../services/api';
import { Modal } from '../common/Modal';
import { User, Phone, Hash, FileText, RefreshCw, AlertCircle } from 'lucide-react';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactToEdit?: Contact | null;
  onSaved: () => void;
}

export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  contactToEdit,
  onSaved
}) => {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lid, setLid] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contactToEdit) {
      setName(contactToEdit.name || '');
      setPhoneNumber(contactToEdit.phone_number || '');
      setLid(contactToEdit.lid || '');
      setNotes(contactToEdit.notes || '');
    } else {
      setName('');
      setPhoneNumber('');
      setLid('');
      setNotes('');
    }
    setError(null);
  }, [contactToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Contact name is required.');
      return;
    }

    if (!phoneNumber.trim() && !lid.trim()) {
      setError('Please provide at least a phone number or a WhatsApp LID.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (contactToEdit) {
        await api.contacts.update(contactToEdit.id, {
          name: name.trim(),
          phone_number: phoneNumber.trim() || null,
          lid: lid.trim() || null,
          notes: notes.trim() || null
        });
      } else {
        await api.contacts.create({
          name: name.trim(),
          phone_number: phoneNumber.trim() || null,
          lid: lid.trim() || null,
          notes: notes.trim() || null
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save contact.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contactToEdit ? 'Edit WhatsApp Contact' : 'Add New Contact'}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-500" />
            Contact Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 shadow-xs"
          />
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              Phone Number
            </span>
            <span className="text-[11px] text-slate-500">Optional if LID provided</span>
          </label>
          <input
            type="tel"
            placeholder="e.g. +919876543210"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono shadow-xs"
          />
        </div>

        {/* WhatsApp LID */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-sky-600" />
              WhatsApp LID Identifier
            </span>
            <span className="text-[11px] text-slate-500">Optional if Phone provided</span>
          </label>
          <input
            type="text"
            placeholder="e.g. 7757465940199@lid"
            value={lid}
            onChange={(e) => setLid(e.target.value)}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 font-mono shadow-xs"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            WhatsApp privacy identifier. Contacts may have phone, LID, or both.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Notes & Details
          </label>
          <textarea
            rows={2}
            placeholder="Optional notes or details about this contact..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 resize-none shadow-xs"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {contactToEdit ? 'Save Changes' : 'Create Contact'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

