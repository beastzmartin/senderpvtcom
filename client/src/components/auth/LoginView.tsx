import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContact } from '../../context/ContactContext';
import {
  MessageSquare,
  Lock,
  User,
  UserPlus,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Mail,
  Building,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  Zap,
  ArrowRight,
  MessageCircle,
  Phone,
  Edit2
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, register } = useAuth();
  const { phone, getWhatsAppUrl, openEditModal } = useContact();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [planTier, setPlanTier] = useState<'starter' | 'pro'>('starter');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegisterMode) {
      if (password.length < 4) {
        setError('Password must be at least 4 characters long.');
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        setError('Passwords do not match. Please verify your password.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isRegisterMode) {
        await register({
          username: username.trim(),
          password,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          company_name: companyName.trim() || undefined,
          plan_tier: planTier
        });
      } else {
        await login(username.trim(), password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50 font-sans">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Logo & Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20 mb-3.5">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">WhatsApp SaaS Platform</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Multi-Device WhatsApp Web • Anonymous LID Messaging • Batch Extractor • Broadcast Scheduler
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 mb-6">
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(false);
                setError(null);
                setUsername('');
                setPassword('');
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                !isRegisterMode
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In to Account
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(true);
                setError(null);
                setUsername('');
                setPassword('');
                setConfirmPassword('');
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                isRegisterMode
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Create Account (No OTP)
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <>
                {/* Full Name & Company Name Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-500 transition shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      Company / Agency
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Apex Marketing"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-500 transition shadow-2xs"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. contact@mybusiness.com"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-500 transition shadow-2xs"
                  />
                </div>
              </>
            )}

            {/* Username or Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {isRegisterMode ? 'Choose Username *' : 'Username or Email Address'}
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegisterMode ? 'e.g. john_agency' : 'admin or your email'}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 transition shadow-2xs"
              />
            </div>

            {/* Password Fields */}
            <div className={isRegisterMode ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-4'}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Password *
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 transition shadow-2xs"
                  />
                </div>
              </div>

              {isRegisterMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Confirm Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-500 transition shadow-2xs"
                  />
                </div>
              )}
            </div>

            {/* Plan Selection on Signup */}
            {isRegisterMode && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-purple-600" />
                  Select Initial Subscription Tier
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setPlanTier('starter')}
                    className={`p-3 rounded-2xl border transition cursor-pointer select-none ${
                      planTier === 'starter'
                        ? 'bg-purple-50/60 border-purple-500 ring-2 ring-purple-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-900">Starter Plan</span>
                      <span className="text-[10px] font-bold text-slate-600">30-Day Pass</span>
                    </div>
                    <p className="text-[11px] text-slate-500">1 Device • 100 msgs/day</p>
                  </div>

                  <div
                    onClick={() => setPlanTier('pro')}
                    className={`p-3 rounded-2xl border transition cursor-pointer select-none relative overflow-hidden ${
                      planTier === 'pro'
                        ? 'bg-purple-50/60 border-purple-500 ring-2 ring-purple-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-purple-900 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-600" />
                        Pro Plan
                      </span>
                      <span className="text-[9px] font-extrabold bg-purple-200 text-purple-800 px-1.5 py-0.2 rounded">
                        POPULAR
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">3 Multi-Devices • 2,500 msgs/day</p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button (NO OTP required!) */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-2.5 px-4 rounded-xl text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 mt-4 disabled:opacity-50 ${
                isRegisterMode
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {isRegisterMode ? 'Creating Your Account...' : 'Authenticating...'}
                </>
              ) : isRegisterMode ? (
                <>
                  <span>Create Account & Start Sending</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </form>

          {/* WhatsApp Support & Direct Inquiry */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col items-center justify-center gap-1.5 text-center">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span>Need help, software activation, or a license key?</span>
              <button
                type="button"
                onClick={openEditModal}
                className="text-slate-400 hover:text-emerald-700 p-0.5"
                title="Edit WhatsApp number"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            <a
              href={getWhatsAppUrl(
                isRegisterMode
                  ? 'Hello! I would like to buy a license or get help creating an account for WhatsApp Sender.'
                  : 'Hello! I need assistance with WhatsApp Sender login or license activation.'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition font-mono shadow-2xs"
              title={`WhatsApp Admin: ${phone}`}
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>WhatsApp: {phone}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
