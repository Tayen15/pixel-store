import React, { useState, useEffect, useRef } from 'react';
import { actions } from 'astro:actions';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  Send,
  User,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Filter,
  AlertCircle,
  Hash,
  Sparkles,
  Check,
  Trash2,
} from 'lucide-react';

interface Conversation {
  id: string;
  buyerSessionId: string;
  buyerName: string;
  buyerEmail?: string | null;
  orderNumber?: string | null;
  status: 'OPEN' | 'RESOLVED';
  lastMessageText?: string | null;
  lastMessageSender?: string | null;
  unreadByAdmin: number;
  unreadByBuyer: number;
  lastMessageAt: string;
  createdAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderType: 'BUYER' | 'ADMIN' | 'SYSTEM';
  senderName: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface SupportChatViewProps {
  showToast: (type: 'success' | 'error', text: string) => void;
  onNavigateOrder?: (orderNumber: string) => void;
}

export const SupportChatView: React.FC<SupportChatViewProps> = ({ showToast, onNavigateOrder }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RESOLVED'>('ALL');
  const [statusCounts, setStatusCounts] = useState({ open: 0, resolved: 0 });
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch conversations
  const fetchConversations = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const { data, error } = await actions.adminGetChatConversations({ status: statusFilter });
      if (data && !error) {
        setConversations(data.conversations as Conversation[]);
        if (data.openCount !== undefined && data.resolvedCount !== undefined) {
          setStatusCounts({ open: data.openCount, resolved: data.resolvedCount });
        }
      }
    } catch (err) {
      if (!silent) showToast('error', 'Gagal memuat daftar obrolan.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch messages for active conversation
  const fetchActiveMessages = async (convId: string, silent = false) => {
    try {
      const { data, error } = await actions.adminGetChatMessages({ conversationId: convId });
      if (data && !error) {
        setMessages(data.messages as Message[]);
        // Update local conversation unread count
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadByAdmin: 0 } : c))
        );
      }
    } catch (err) {
      if (!silent) showToast('error', 'Gagal memuat pesan obrolan.');
    }
  };

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [statusFilter]);

  // When active conversation changes, fetch its messages
  useEffect(() => {
    if (activeConvId) {
      fetchActiveMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId]);

  // Periodic polling for realtime updates
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchConversations(true);
      if (activeConvId) {
        fetchActiveMessages(activeConvId, true);
      }
    }, 3500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeConvId, statusFilter]);

  // Search filter for conversations and registered users
  useEffect(() => {
    let list = [...conversations];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.buyerName.toLowerCase().includes(q) ||
          c.buyerEmail?.toLowerCase().includes(q) ||
          c.orderNumber?.toLowerCase().includes(q) ||
          c.lastMessageText?.toLowerCase().includes(q)
      );

      // Search registered users from database
      setIsSearchingUsers(true);
      actions
        .adminSearchUsersForChat({ query: q })
        .then(({ data }) => {
          if (data?.users) {
            const activeEmails = new Set(
              conversations.map((c) => c.buyerEmail?.toLowerCase()).filter(Boolean)
            );
            const nonActive = data.users.filter((u) => !activeEmails.has(u.email.toLowerCase()));
            setSearchedUsers(nonActive);
          }
        })
        .finally(() => setIsSearchingUsers(false));
    } else {
      setSearchedUsers([]);
    }
    setFilteredConversations(list);
  }, [conversations, searchQuery]);

  const handleSendMessage = async (customText?: string) => {
    const text = (customText || replyText).trim();
    if (!text || !activeConvId || isSending) return;

    setIsSending(true);
    try {
      const { data, error } = await actions.adminSendChatMessage({
        conversationId: activeConvId,
        message: text,
        adminName: 'Admin CS Pixel Store',
      });

      if (data?.success && data.message) {
        setMessages((prev) => [...prev, data.message as Message]);
        if (!customText) setReplyText('');
        // Update conversation last message in list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId
              ? {
                  ...c,
                  lastMessageText: text,
                  lastMessageSender: 'ADMIN',
                  lastMessageAt: new Date().toISOString(),
                }
              : c
          )
        );
      } else {
        showToast('error', error?.message || 'Gagal mengirim pesan.');
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleStatus = async (newStatus: 'OPEN' | 'RESOLVED') => {
    if (!activeConvId) return;
    try {
      const { error } = await actions.adminUpdateChatStatus({
        conversationId: activeConvId,
        status: newStatus,
      });
      if (!error) {
        showToast(
          'success',
          newStatus === 'RESOLVED'
            ? 'Percakapan ditandai selesai dan dipindahkan ke tab Selesai.'
            : 'Percakapan dibuka kembali dan masuk ke tab Semua.'
        );
        await fetchConversations(true);
        // If current filter excludes new status, deselect active conversation
        if (statusFilter === 'ALL' && newStatus === 'RESOLVED') {
          setActiveConvId(null);
          setMessages([]);
        } else if (statusFilter === 'RESOLVED' && newStatus === 'OPEN') {
          setActiveConvId(null);
          setMessages([]);
        } else {
          fetchActiveMessages(activeConvId, true);
        }
      } else {
        showToast('error', error.message);
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  };

  const handleDeleteChat = async (convId: string, buyerName?: string) => {
    const name = buyerName || activeConv?.buyerName || 'ini';
    if (!confirm(`Hapus seluruh riwayat percakapan dengan "${name}"? Seluruh pesan akan dihapus permanen.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await actions.adminDeleteChatConversation({ conversationId: convId });
      if (!error) {
        showToast('success', 'Percakapan berhasil dihapus permanen.');
        if (activeConvId === convId) {
          setActiveConvId(null);
          setMessages([]);
        }
        await fetchConversations(true);
      } else {
        showToast('error', error.message);
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const cannedResponses = [
    'Halo, terima kasih telah menghubungi kami. Ada yang bisa kami bantu?',
    'Pesanan Anda sedang dalam proses verifikasi otomatis oleh sistem.',
    'Mohon cantumkan bukti transfer atau nomor invoice transaksi Anda.',
    'Lisensi Anda telah aktif. Silakan gunakan tautan aktivasi pada dashboard.',
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#141416] p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Pusat Bantuan & Live Chat Pelanggan
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Komunikasi 2 arah langsung dengan pembeli tanpa perantara aplikasi pihak ketiga.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchConversations()}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[720px] bg-white dark:bg-[#141416] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        {/* Left Column: Conversations List */}
        <div className="lg:col-span-4 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-900/30">
          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Cari pembeli, pesan, invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 p-1 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-xl text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setActiveConvId(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                    : 'hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span>Semua</span>
                {statusCounts.open > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold">
                    {statusCounts.open}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setStatusFilter('RESOLVED');
                  setActiveConvId(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  statusFilter === 'RESOLVED'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                    : 'hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span>Selesai</span>
                {statusCounts.resolved > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold">
                    {statusCounts.resolved}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search Result for Registered Users */}
          {searchedUsers.length > 0 && (
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/50 space-y-2">
              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider block">
                Pengguna Terdaftar ({searchedUsers.length}):
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {searchedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="min-w-0 pr-1">
                      <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                        {u.name}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate">{u.email}</div>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await actions.adminOpenUserChat({ userId: u.id });
                        if (res.data?.conversation) {
                          await fetchConversations(true);
                          setActiveConvId(res.data.conversation.id);
                          setSearchQuery('');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold shrink-0 cursor-pointer transition shadow-xs"
                    >
                      Buka Chat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversations Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-zinc-400">Memuat percakapan...</div>
            ) : filteredConversations.length === 0 && searchedUsers.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
                <p className="text-xs text-zinc-500">Belum ada percakapan aktif.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === activeConvId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    className={`w-full text-left p-4 transition-colors flex items-start gap-3 relative group cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/20'
                        : 'hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-sm" />
                    )}

                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-700 dark:text-zinc-300 font-bold text-xs uppercase">
                      {conv.buyerName.slice(0, 2)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {conv.buyerName}
                        </span>
                        <span className="text-[10px] text-zinc-400 shrink-0">
                          {conv.lastMessageAt
                            ? new Date(conv.lastMessageAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>

                      {/* Order Number Badge */}
                      {conv.orderNumber && (
                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-100/70 dark:bg-blue-950/50 text-[10px] font-mono text-blue-700 dark:text-blue-300 mb-1">
                          <Hash className="w-2.5 h-2.5" />
                          {conv.orderNumber}
                        </div>
                      )}

                      {/* Last Message Snippet */}
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {conv.lastMessageSender === 'ADMIN' ? 'Admin: ' : ''}
                        {conv.lastMessageText || 'Memulai percakapan...'}
                      </p>
                    </div>

                    {/* Unread Pill */}
                    {conv.unreadByAdmin > 0 && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {conv.unreadByAdmin}
                      </span>
                    )}

                    {/* Delete Icon Button on List Item */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(conv.id, conv.buyerName);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 transition cursor-pointer shrink-0 self-center"
                      title="Hapus percakapan ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Conversation */}
        <div className="lg:col-span-8 flex flex-col h-full bg-white dark:bg-[#141416]">
          {activeConv ? (
            <>
              {/* Active Conversation Top Bar */}
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm uppercase shadow-xs">
                    {activeConv.buyerName.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {activeConv.buyerName}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          activeConv.status === 'OPEN'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {activeConv.status === 'OPEN' ? 'Terbuka' : 'Selesai'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-0.5 font-mono">
                      {activeConv.buyerEmail && <span>{activeConv.buyerEmail}</span>}
                      {activeConv.orderNumber && (
                        <span className="text-blue-600 dark:text-blue-400">
                          Invoice: {activeConv.orderNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Toggle Action & Delete */}
                <div className="flex items-center gap-2">
                  {activeConv.status === 'OPEN' ? (
                    <button
                      onClick={() => handleToggleStatus('RESOLVED')}
                      className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Tandai Selesai
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleStatus('OPEN')}
                      className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                      Buka Kembali
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteChat(activeConv.id, activeConv.buyerName)}
                    disabled={isDeleting}
                    className="px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Hapus percakapan ini secara permanen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Chat
                  </button>
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50/20 dark:bg-zinc-950/20">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                    Memuat riwayat pesan...
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.senderType === 'ADMIN';
                    const isSystem = msg.senderType === 'SYSTEM';

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2">
                          <div className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-400 max-w-md text-center leading-relaxed">
                            {msg.message}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-zinc-400 font-medium">
                          {isAdmin ? (
                            <>
                              <span>Admin CS</span>
                              <ShieldCheck className="w-3 h-3 text-blue-500" />
                            </>
                          ) : (
                            <>
                              <User className="w-3 h-3 text-zinc-400" />
                              <span>{activeConv.buyerName}</span>
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
                            isAdmin
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

              {/* Quick Canned Responses */}
              <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-x-auto flex gap-2 no-scrollbar">
                <span className="text-[10px] uppercase font-bold text-zinc-400 self-center shrink-0">
                  Respon Cepat:
                </span>
                {cannedResponses.map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(res)}
                    className="shrink-0 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {res.length > 38 ? res.slice(0, 38) + '...' : res}
                  </button>
                ))}
              </div>

              {/* Reply Input Bar */}
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="Tulis balasan untuk pembeli (tekan Enter untuk kirim)..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={isSending}
                    className="flex-1 px-4 py-3 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || isSending}
                    className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-400 space-y-3">
              <MessageSquare className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
              <div className="max-w-xs">
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Pilih Percakapan
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Pilih salah satu tiket obrolan pelanggan di sebelah kiri untuk membaca dan membalas pesan.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
