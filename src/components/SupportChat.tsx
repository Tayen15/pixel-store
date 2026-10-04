import React, { useState, useEffect, useRef } from 'react';
import { actions } from 'astro:actions';
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
} from 'lucide-react';

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

  // Check customer session on client mount if not passed from server
  useEffect(() => {
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

  // 1. If user is NOT logged in: show clean login requirement card
  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto bg-white dark:bg-[#141416] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            Masuk untuk Live Support
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Layanan obrolan langsung terhubung langsung ke akun pelanggan Anda agar riwayat dan pesanan teridentifikasi.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setAuthError('');
            }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              authMode === 'login'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
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
            className={`flex-1 py-2 rounded-lg transition-all ${
              authMode === 'register'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Daftar Baru
          </button>
        </div>

        {/* Error Alert */}
        {authError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {authMode === 'register' && (
            <div>
              <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                placeholder="Budi Santoso"
                className="w-full px-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
              Alamat Email
            </label>
            <input
              type="email"
              required
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full px-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
              Kata Sandi
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full px-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isAuthSubmitting}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
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
    <div className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[600px] bg-white dark:bg-[#141416] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
      {/* 1. Header Bar */}
      <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">
                Live Support Pixel Store
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Online
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Terhubung langsung dengan Admin Pengelola Toko
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-blue-500" />
            <span>{currentUser.name}</span>
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
