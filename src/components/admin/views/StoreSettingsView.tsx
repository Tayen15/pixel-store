import React, { useState } from 'react';
import {
  Settings,
  Store,
  Phone,
  Clock,
  ShieldCheck,
  Save,
  Lock,
  AlertCircle,
  CheckCircle2,
  QrCode,
  Power,
  Mail,
  Send,
  Server,
} from 'lucide-react';
import { actions } from 'astro:actions';

interface StoreSettingsViewProps {
  config: any;
  onConfigSaved: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

export const StoreSettingsView: React.FC<StoreSettingsViewProps> = ({
  config,
  onConfigSaved,
  showToast,
}) => {
  // Store info state
  const [storeName, setStoreName] = useState(config?.store?.storeName || 'PIXEL STORE');
  const [storeTagline, setStoreTagline] = useState(
    config?.store?.storeTagline || 'Akun Premium & Lisensi Digital. Bayar Sekali, Langsung Muncul.'
  );
  const [supportWhatsapp, setSupportWhatsapp] = useState(
    config?.store?.supportWhatsapp || '08123456789'
  );
  const [announcement, setAnnouncement] = useState(
    config?.store?.announcement || 'Pengiriman otomatis 24/7 aktif via QRIS.'
  );
  const [isStoreOpen, setIsStoreOpen] = useState(config?.store?.isStoreOpen !== false);
  const [qrisNmid, setQrisNmid] = useState(config?.store?.qrisNmid || 'ID1020021303845');
  const [expiryMinutes, setExpiryMinutes] = useState(config?.orders?.expiryMinutes || 15);
  const [maxQuantity, setMaxQuantity] = useState(config?.orders?.maxQuantityPerOrder || 5);
  const [isSavingStore, setIsSavingStore] = useState(false);

  // Security / PIN state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);

  // SMTP Testing state
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStore(true);
    try {
      const { data, error } = await actions.adminUpdateStoreSettings({
        storeName: storeName.trim(),
        storeTagline: storeTagline.trim(),
        supportWhatsapp: supportWhatsapp.trim(),
        announcement: announcement.trim(),
        isStoreOpen,
        qrisNmid: qrisNmid.trim(),
        expiryMinutes: Number(expiryMinutes),
        maxQuantityPerOrder: Number(maxQuantity),
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal menyimpan pengaturan toko.');
        return;
      }

      showToast('success', 'Pengaturan toko berhasil disimpan ke database!');
      onConfigSaved();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPin.trim() || !newPin.trim()) {
      showToast('error', 'Semua kolom PIN wajib diisi.');
      return;
    }
    if (newPin !== confirmPin) {
      showToast('error', 'Konfirmasi PIN baru tidak cocok.');
      return;
    }
    if (newPin.length < 4) {
      showToast('error', 'PIN baru minimal 4 karakter.');
      return;
    }

    setIsUpdatingPin(true);
    try {
      const { data, error } = await actions.adminUpdatePin({
        currentPin: currentPin.trim(),
        newPin: newPin.trim(),
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal mengubah PIN admin.');
        return;
      }

      showToast('success', 'PIN Admin berhasil diperbarui!');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsUpdatingPin(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: General Store Settings */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-6 shadow-xs">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-500" />
                <span>Profil & Operasional Toko</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Kelola identitas etalase publik dan parameter transaksi QRIS
              </p>
            </div>

            {/* Store Open/Close Switch */}
            <button
              type="button"
              onClick={() => setIsStoreOpen(!isStoreOpen)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isStoreOpen
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isStoreOpen ? 'Toko Buka (Aktif)' : 'Toko Tutup (Maintenance)'}</span>
            </button>
          </div>

          <form onSubmit={handleSaveStoreSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Nama Toko:
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Nomor WhatsApp Customer Service:
                </label>
                <input
                  type="text"
                  value={supportWhatsapp}
                  onChange={(e) => setSupportWhatsapp(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
                  placeholder="08123456789"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Tagline Toko:
              </label>
              <input
                type="text"
                value={storeTagline}
                onChange={(e) => setStoreTagline(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Teks Pengumuman Banner (Store Announcement):
              </label>
              <input
                type="text"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Masa Berlaku QRIS:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono"
                  />
                  <span className="text-zinc-400 shrink-0 font-medium">Menit</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Max Kuantitas/Order:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={maxQuantity}
                    onChange={(e) => setMaxQuantity(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono"
                  />
                  <span className="text-zinc-400 shrink-0 font-medium">Unit</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  NMID QRIS Merchant:
                </label>
                <input
                  type="text"
                  value={qrisNmid}
                  onChange={(e) => setQrisNmid(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSavingStore}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingStore ? 'Menyimpan...' : 'Simpan Profil Toko'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Security & SMTP System */}
        <div className="space-y-6">
          {/* Security & Admin PIN Update */}
          <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-6 shadow-xs">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-500" />
              <span>Keamanan & PIN Akses Admin</span>
            </h3>
            <p className="text-xs text-zinc-500">
              Ubah PIN login panel kontrol untuk proteksi toko
            </p>
          </div>

          <form onSubmit={handleUpdatePin} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                PIN Saat Ini:
              </label>
              <input
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="Masukkan PIN lama"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                PIN Baru:
              </label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="Minimal 4 karakter"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Konfirmasi PIN Baru:
              </label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Ulangi PIN baru"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingPin}
                className="w-full py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isUpdatingPin ? 'Memperbarui...' : 'Perbarui PIN Admin'}</span>
              </button>
            </div>
          </form>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 text-[11px] text-zinc-500 space-y-1">
            <div className="font-semibold text-zinc-700 dark:text-zinc-300">Sesi HTTP-Only Aktif:</div>
            <p>
              Token autentikasi terlindungi dari serangan XSS dengan enkripsi HMAC-SHA256 valid 7 hari.
            </p>
          </div>
        </div>

        {/* Right Bottom: SMTP & Email Notification System */}
        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-5 shadow-xs">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-500" />
                <span>Sistem SMTP & Notifikasi Email</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Pengiriman resi & lisensi digital otomatis ke email pembeli
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Aktif
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1.5">
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-zinc-400" /> Host:</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">smtp.sumopod.com</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>Port & Protokol:</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-white">465 (SSL Encrypted)</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>Akun Pengirim:</span>
                <span className="font-mono text-zinc-500 truncate max-w-[200px]">cmv2iw8n9bka...</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>Email Display:</span>
                <span className="font-mono text-zinc-500">no-reply@pixelstore.oktaa.my.id</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                Uji Coba Pengiriman Email:
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="Masukkan email Anda (contoh@gmail.com)"
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isTestingSmtp}
                  onClick={async () => {
                    if (!testEmailAddress.trim()) {
                      showToast('error', 'Masukkan alamat email tujuan untuk uji coba kirim.');
                      return;
                    }
                    setIsTestingSmtp(true);
                    setSmtpTestResult(null);
                    try {
                      const res = await actions.adminTestSmtpConnection({
                        testEmail: testEmailAddress.trim(),
                      });
                      if (res.error) {
                        setSmtpTestResult({ success: false, message: res.error.message });
                        showToast('error', res.error.message);
                      } else if (res.data) {
                        setSmtpTestResult({ success: true, message: res.data.message });
                        showToast('success', res.data.message);
                      }
                    } catch (err) {
                      const msg = (err as Error).message || 'Gagal mengetes SMTP';
                      setSmtpTestResult({ success: false, message: msg });
                      showToast('error', msg);
                    } finally {
                      setIsTestingSmtp(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isTestingSmtp ? 'Mengirim...' : 'Kirim Tes'}</span>
                </button>
              </div>
            </div>

            <div className="pt-1 flex gap-2">
              <button
                type="button"
                disabled={isTestingSmtp}
                onClick={async () => {
                  setIsTestingSmtp(true);
                  setSmtpTestResult(null);
                  try {
                    const res = await actions.adminTestSmtpConnection({});
                    if (res.error) {
                      setSmtpTestResult({ success: false, message: res.error.message });
                      showToast('error', res.error.message);
                    } else if (res.data) {
                      setSmtpTestResult({ success: true, message: res.data.message });
                      showToast('success', res.data.message);
                    }
                  } catch (err) {
                    const msg = (err as Error).message || 'Gagal cek koneksi SMTP';
                    setSmtpTestResult({ success: false, message: msg });
                    showToast('error', msg);
                  } finally {
                    setIsTestingSmtp(false);
                  }
                }}
                className="w-full py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Verifikasi Handshake Saja</span>
              </button>
            </div>

            {smtpTestResult && (
              <div
                className={`p-3 rounded-xl border text-[11px] flex items-start gap-2 ${
                  smtpTestResult.success
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                }`}
              >
                {smtpTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                )}
                <div className="leading-relaxed">{smtpTestResult.message}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
