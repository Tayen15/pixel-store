'use client';

import React, { useState, useEffect, useRef } from 'react';
import { actions } from '@/actions';
import {
  Send,
  MessageCircle,
  HelpCircle,
  ShieldCheck,
  CreditCard,
  Key,
  RefreshCw,
  User,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Copy,
  Check,
  Hash,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { authClient } from '@/lib/auth/client';

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

interface ChatMessage {
  id: string;
  senderType: 'BUYER' | 'ADMIN' | 'SYSTEM';
  senderName: string;
  message: string;
  createdAt: string;
  orderData?: {
    orderNumber: string;
    productName: string;
    status: string;
    totalAmountIdr: number;
    licenseCodes: string[];
  };
}

interface SupportChatProps {
  initialUser?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null;
}

export const SupportChat: React.FC<SupportChatProps> = ({ initialUser = null }) => {
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [conversationId, setConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isInitializing, setIsInitializing] = useState(Boolean(initialUser));
  const [isSending, setIsSending] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Auth Form State (when not logged in)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const [orderQuery, setOrderQuery] = useState<string>('');

  // Check customer session on client mount if not passed from server
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const orderParam = params.get('orderNumber') || params.get('order');
      if (orderParam) {
        setOrderQuery(orderParam);
        setInputText(`Halo Admin Pixel Store, saya butuh bantuan untuk pesanan ${orderParam}. Stok supplier kosong saat verifikasi pembayaran. Mohon bantuan aktivasi manual atau refund.`);
      }
    }

    if (!initialUser) {
      actions.getCurrentUser().then(({ data }) => {
        if (data?.user) {
          setCurrentUser(data.user);
          loadChat();
        } else {
          setIsInitializing(false);
        }
      });
    } else {
      loadChat();
    }
  }, []);

  const loadChat = async () => {
    setIsInitializing(true);
    try {
      const { data, error } = await actions.getOrCreateBuyerChat({});
      if (data?.isAuthenticated && data.user) {
        setCurrentUser(data.user);
        if (data.conversation) {
          setConversationId(data.conversation.id);
          setMessages((data.messages || []) as ChatMessage[]);
        } else {
          // No conversation exists yet in DB (lazy creation)
          setConversationId('');
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Failed to load chat:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  // Poll for admin replies only if a real conversationId exists in database
  useEffect(() => {
    if (!conversationId || !currentUser) return;

    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await actions.getBuyerChatMessages({
          conversationId,
        });

        if (data?.messages) {
          setMessages((prev) => {
            if (
              data.messages.length !== prev.length ||
              (data.messages.length > 0 &&
                data.messages[data.messages.length - 1].id !== prev[prev.length - 1]?.id)
            ) {
              return data.messages as ChatMessage[];
            }
            return prev;
          });
        }
      } catch {}
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [conversationId, currentUser]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(code);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !currentUser || isSending) return;

    setIsSending(true);
    if (!textToSend) setInputText('');

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderType: 'BUYER',
      senderName: currentUser.name,
      message: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data, error } = await actions.sendBuyerChatMessage({
        conversationId: conversationId || undefined,
        message: text,
      });

      if (data?.success && data.message) {
        if (data.conversation && !conversationId) {
          setConversationId(data.conversation.id);
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? (data.message as ChatMessage) : m))
        );

        // Check if message has order number
        const orderMatch = text.match(/PIXEL-\d{8}-[A-Za-z0-9]+/i) || text.match(/PIXEL-[A-Za-z0-9-]+/i);
        if (orderMatch) {
          const orderNum = orderMatch[0].toUpperCase();
          try {
            const { data: orderData } = await actions.getOrderStatus({ orderNumber: orderNum });
            if (orderData) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `order-card-${Date.now()}`,
                  senderType: 'SYSTEM',
                  senderName: 'Sistem Pixel Store',
                  message: `Data pesanan ${orderData.orderNumber} berhasil diverifikasi:`,
                  createdAt: new Date().toISOString(),
                  orderData: {
                    orderNumber: orderData.orderNumber,
                    productName: orderData.productName,
                    status: orderData.status,
                    totalAmountIdr: orderData.totalAmountIdr,
                    licenseCodes: orderData.licenseCodes || [],
                  },
                },
              ]);
            }
          } catch {}
        }
      } else {
        alert(error?.message || 'Gagal mengirim pesan.');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAuthError('');
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: typeof window !== 'undefined' ? window.location.href : '/support',
      });
    } catch (err) {
      console.error('Google sign-in error:', err);
      setAuthError((err as Error).message || 'Gagal memulai login dengan Google.');
      setIsGoogleLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthSubmitting(true);

    try {
      if (authMode === 'login') {
        const { data, error } = await actions.loginUser({
          email: authEmail,
          password: authPassword,
        });

        if (error) {
          setAuthError(error.message);
        } else if (data?.user) {
          setCurrentUser(data.user);
          loadChat();
        }
      } else {
        const { data, error } = await actions.registerUser({
          name: authName,
          email: authEmail,
          password: authPassword,
        });

        if (error) {
          setAuthError(error.message);
        } else if (data?.user) {
          setCurrentUser(data.user);
          loadChat();
        }
      }
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const quickActions = [
    { label: '🔑 Cara Aktivasi Lisensi', text: 'Bagaimana cara melakukan aktivasi lisensi produk yang sudah saya beli?' },
    { label: '💳 Cek Status Pesanan', text: 'Saya ingin mengecek status pesanan saya: ' },
    { label: '🔄 Garansi & Refund', text: 'Bagaimana syarat dan ketentuan garansi refund jika ada kendala produk?' },
    { label: '👨‍💼 Bantuan Transaksi', text: 'Halo Admin, saya mengalami kendala pada transaksi pembelian saya.' },
  ];

  // 1. If user is NOT logged in: show clean login requirement card with Google OAuth
  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto bg-white dark:bg-[#121215] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-5">
        {orderQuery && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <div className="leading-tight">
              Bantuan untuk Pesanan: <strong className="font-mono">{orderQuery}</strong>
            </div>
          </div>
        )}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Masuk untuk Live Support
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Layanan obrolan langsung terhubung dengan akun pelanggan Anda agar verifikasi pesanan dan garansi instan.
          </p>
        </div>

        {/* Google OAuth One-Click Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isAuthSubmitting}
          className="w-full py-2.5 px-4 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 text-zinc-900 dark:text-zinc-100 font-semibold text-xs transition flex items-center justify-center gap-2.5 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
        >
          {isGoogleLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              <span>Menghubungkan ke Google...</span>
            </>
          ) : (
            <>
              <GoogleIcon className="w-4 h-4 shrink-0" />
              <span>Lanjutkan dengan Google</span>
            </>
          )}
        </button>

        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <span className="relative bg-white dark:bg-[#121215] px-2.5 text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
            atau gunakan email
          </span>
        </div>

        {/* Tab Selector Pill */}
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-full text-xs font-semibold border border-zinc-200/60 dark:border-zinc-800/60">
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setAuthError('');
            }}
            className={`flex-1 py-1.5 rounded-full transition-all ${
              authMode === 'login'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Masuk Akun
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setAuthError('');
            }}
            className={`flex-1 py-1.5 rounded-full transition-all ${
              authMode === 'register'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Daftar Baru
          </button>
        </div>

        {/* Error Alert */}
        {authError && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-3.5">
          {authMode === 'register' && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                Nama Lengkap
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Budi Santoso"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                />
                <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
              Alamat Email
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
              />
              <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                Kata Sandi
              </label>
              {authMode === 'login' && (
                <a
                  href="/reset-password"
                  target="_blank"
                  className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition font-medium"
                >
                  Lupa kata sandi?
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
              />
              <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthSubmitting || isGoogleLoading}
            className="w-full py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isAuthSubmitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{authMode === 'login' ? 'Masuk & Buka Obrolan' : 'Daftar & Buka Obrolan'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 text-center">
          <a
            href="/"
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
          >
            ← Kembali ke Katalog Produk
          </a>
        </div>
      </div>
    );
  }

  // 2. User is logged in: show real-time chat interface
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[600px] bg-white dark:bg-[#121215] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
      {/* 1. Header Bar */}
      <div className="px-5 sm:px-6 py-4 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold shadow-xs">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">
                Live Support Pixel Store
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400">
                Online
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Terhubung langsung dengan Admin Pengelola Toko
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2 shadow-2xs">
            {currentUser.image ? (
              <img
                src={currentUser.image}
                alt={currentUser.name}
                className="w-5 h-5 rounded-full object-cover ring-1 ring-emerald-500/70"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold flex items-center justify-center">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="truncate max-w-[120px]">{currentUser.name}</span>
          </div>
        </div>
      </div>

      {/* 2. Chat Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50/20 dark:bg-zinc-950/20">
        {isInitializing ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-zinc-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            <span>Menghubungkan ke layanan bantuan...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-3 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
              <MessageCircle className="w-6 h-6" />
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Halo, <strong className="text-zinc-900 dark:text-zinc-100">{currentUser.name}</strong>! Ada yang bisa kami bantu mengenai pesanan atau aktivasi akun Anda? Ketik pesan Anda di bawah untuk memulai obrolan dengan Tim Admin.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderType === 'BUYER';
            const isSystem = msg.senderType === 'SYSTEM';

            if (isSystem && msg.orderData) {
              const od = msg.orderData;
              const isCompleted = od.status === 'COMPLETED';
              return (
                <div key={msg.id} className="max-w-md mx-auto my-3">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          {od.orderNumber}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {isCompleted ? 'Selesai & Aktif' : od.status}
                      </span>
                    </div>

                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {od.productName}
                      </div>
                      <div className="text-zinc-500">
                        Total Tagihan: Rp {od.totalAmountIdr.toLocaleString('id-ID')}
                      </div>
                    </div>

                    {isCompleted && od.licenseCodes && od.licenseCodes.length > 0 && (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-2">
                        <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                          Tautan Aktivasi / Lisensi:
                        </div>
                        {od.licenseCodes.map((code, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 font-mono text-[11px]"
                          >
                            <span className="truncate text-blue-600 dark:text-blue-400 select-all">
                              {code}
                            </span>
                            <button
                              onClick={() => handleCopy(code)}
                              className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === code ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span>Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Salin</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-400 text-center max-w-md">
                    {msg.message}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-zinc-400 font-medium">
                  {isMe ? (
                    <>
                      <span>Anda</span>
                      <User className="w-3 h-3 text-zinc-400" />
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3 h-3 text-blue-500" />
                      <span>{msg.senderName || 'Admin CS'}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>
                    {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div
                  className={`max-w-md sm:max-w-lg p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-xs shadow-xs'
                      : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-bl-xs shadow-xs'
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Quick Action Chips */}
      <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-x-auto flex gap-2 no-scrollbar">
        {quickActions.map((qa, idx) => (
          <button
            key={idx}
            onClick={() => {
              if (qa.text.endsWith(': ')) {
                setInputText(qa.text);
              } else {
                handleSend(qa.text);
              }
            }}
            className="shrink-0 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* 4. Input Bar */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Ketik pertanyaan untuk Admin (tekan Enter untuk kirim)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending || isInitializing}
            className="flex-1 px-4 py-3 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending || isInitializing}
            className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kirim</span>
          </button>
        </form>
      </div>
    </div>
  );
};
