import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import { AdminPortalLinksPage } from './components/AdminPortalLinksPage';
import { CollectiveListPage } from './components/CollectiveListPage';
import { DossierDetailView } from './components/DossierDetailView';
import { FilePreviewModal } from './components/FilePreviewModal';
import { HammerSickleIcon } from './components/HammerSickleIcon';
import { IndividualListPage } from './components/IndividualListPage';
import { OverviewPage } from './components/OverviewPage';
import { PortalLoginGateway } from './components/PortalLoginGateway';
import { SummaryExportPage } from './components/SummaryExportPage';
import { ToastContainer } from './components/ToastContainer';
import { DEFAULT_YEAR } from './data/seedData';
import {
  ensureSupabaseSeededByAdmin,
  fetchAllDossiers,
  isMissingTableError,
  resetAllDataAsAdmin,
  saveDossierAsAdmin,
  saveDossierAsBranch,
  saveDossierAsMember,
  saveManyDossiersAsAdmin,
  subscribeDossiersRealtime,
} from './services/supabaseService';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  BranchSession,
  Dossier,
  MemberSession,
  NavSection,
  PortalMode,
  PortalSession,
  StoredFileRecord,
  ToastMessage,
  getDossierDisplayName,
} from './types';

interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: React.FC<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'collective', label: 'Hồ sơ tập thể', icon: FolderOpen },
  { id: 'individual', label: 'Hồ sơ cá nhân', icon: Users },
  { id: 'summary', label: 'Tổng hợp và xuất Excel', icon: FileSpreadsheet },
  {
    id: 'access',
    label: 'Link cổng & Mật khẩu',
    icon: Link2,
    adminOnly: true,
  },
];

function getInitialPortalFromUrl(): PortalMode {
  const params = new URLSearchParams(window.location.search);
  const cong = (params.get('cong') ?? '').trim().toLowerCase();
  const path = window.location.pathname
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  const target = cong || path || hash;
  if (target === 'dang-vien') return 'member';
  if (target === 'chi-bo') return 'branch';
  if (target === 'admin') return 'admin';
  return 'gateway';
}

export default function App() {
  const [initialPortal, setInitialPortal] = useState<PortalMode>(() =>
    getInitialPortalFromUrl()
  );

  useEffect(() => {
    const onUrlChange = () => setInitialPortal(getInitialPortalFromUrl());
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);
    return () => {
      window.removeEventListener('popstate', onUrlChange);
      window.removeEventListener('hashchange', onUrlChange);
    };
  }, []);
  const [session, setSession] = useState<PortalSession | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [needsSchemaSetup, setNeedsSchemaSetup] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(
    null
  );
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(
    DEFAULT_YEAR
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<StoredFileRecord | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState('');

  const pushToast = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshDossiersNow = useCallback(async () => {
    try {
      const latest = await fetchAllDossiers();
      setDossiers(latest);
      setNeedsSchemaSetup(false);
    } catch (err) {
      if (isMissingTableError(err)) {
        setNeedsSchemaSetup(true);
      }
    }
  }, []);

  // 1. Real-time Supabase listener + initial fetch for all dossiers
  useEffect(() => {
    setIsLoadingData(true);
    const unsubscribe = subscribeDossiersRealtime(
      (items) => {
        setDossiers(items);
        setNeedsSchemaSetup(false);
        setIsLoadingData(false);
      },
      (err) => {
        setIsLoadingData(false);
        if (isMissingTableError(err)) {
          setNeedsSchemaSetup(true);
          return;
        }
        console.error('Supabase dossiers sync error:', err);
        pushToast(
          'error',
          'Không thể đồng bộ dữ liệu trực tuyến từ Supabase. Vui lòng thử tải lại trang.'
        );
      }
    );
    return () => unsubscribe();
  }, [pushToast, retryCounter]);

  const hydrateAdminSession = useCallback(
    async (uid: string, email: string, fullNameHint?: string) => {
      setSession((prev) => {
        if (prev && prev.type !== 'admin') return prev;
        return {
          type: 'admin',
          uid,
          email,
          displayName: fullNameHint || 'Nguyễn Tiến Dương',
        };
      });

      try {
        const seeded = await ensureSupabaseSeededByAdmin();
        await refreshDossiersNow();
        if (seeded.seededDossiersCount > 0 || seeded.seededAccessCount > 0) {
          pushToast(
            'success',
            `Đã tự động khởi tạo ${seeded.seededDossiersCount} hồ sơ năm 2026 và mật khẩu 4 Chi bộ trên Supabase.`
          );
        }
      } catch (err) {
        if (isMissingTableError(err)) {
          setNeedsSchemaSetup(true);
          pushToast(
            'error',
            'Bảng dữ liệu chưa tồn tại trên Supabase. Vui lòng chạy tệp supabase_setup.sql trong SQL Editor.'
          );
        } else {
          console.error('Supabase seed error:', err);
        }
      }
    },
    [pushToast, refreshDossiersNow]
  );

  // 2. Listen to Supabase Auth state for Admin portal persistence
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    const checkExistingSession = async () => {
      if (initialPortal === 'member' || initialPortal === 'branch') return;
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (active && user) {
          await hydrateAdminSession(
            user.id,
            user.email ?? '',
            (user.user_metadata?.full_name as string | undefined) || undefined
          );
        }
      } catch {
        // Keep login gateway visible if session check fails
      }
    };

    void checkExistingSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, authSession) => {
        if (!active) return;
        if (initialPortal === 'member' || initialPortal === 'branch') return;
        if (authSession?.user) {
          void hydrateAdminSession(
            authSession.user.id,
            authSession.user.email ?? '',
            (authSession.user.user_metadata?.full_name as string | undefined) ||
              undefined
          );
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [initialPortal, hydrateAdminSession]);

  const handleSignInAdmin = async (email: string, password: string) => {
    setAdminAuthError('');
    if (!isSupabaseConfigured) {
      setAdminAuthError(
        'Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel. Vui lòng thêm 2 biến môi trường này trong Vercel Project Settings rồi Redeploy.'
      );
      return;
    }
    setAdminAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        const msg = (error?.message ?? '').toLowerCase();
        if (msg.includes('invalid login credentials')) {
          setAdminAuthError(
            'Email hoặc mật khẩu Admin không đúng. Vui lòng kiểm tra lại tài khoản đã tạo trong Supabase Authentication -> Users.'
          );
        } else if (msg.includes('email not confirmed')) {
          setAdminAuthError(
            'Email Admin chưa được xác nhận. Trong Supabase -> Authentication -> Users, hãy tích "Auto Confirm User" khi tạo tài khoản.'
          );
        } else {
          setAdminAuthError(
            error?.message || 'Không thể đăng nhập Admin trên Supabase.'
          );
        }
        return;
      }

      setSession({
        type: 'admin',
        uid: data.user.id,
        email: data.user.email ?? email,
        displayName:
          (data.user.user_metadata?.full_name as string | undefined) ||
          'Nguyễn Tiến Dương',
      });
      setActiveNav('overview');
      setSelectedDossierId(null);

      try {
        const seeded = await ensureSupabaseSeededByAdmin();
        await refreshDossiersNow();
        if (seeded.seededDossiersCount > 0 || seeded.seededAccessCount > 0) {
          pushToast(
            'success',
            `Đăng nhập Admin thành công! Đã khởi tạo ${seeded.seededDossiersCount} hồ sơ năm 2026 và mật khẩu 4 Chi bộ trên Supabase.`
          );
        } else {
          pushToast('success', 'Đăng nhập Cổng Admin Đảng uỷ thành công.');
        }
      } catch (seedErr) {
        if (isMissingTableError(seedErr)) {
          setNeedsSchemaSetup(true);
          setSession(null);
          setAdminAuthError(
            'Tài khoản Admin hợp lệ nhưng chưa chạy mã SQL khởi tạo bảng trên Supabase. Vui lòng bấm "Sao chép mã SQL khởi tạo" ở khung phía trên rồi chạy trong SQL Editor của Supabase.'
          );
        } else {
          pushToast('success', 'Đăng nhập Cổng Admin Đảng uỷ thành công.');
        }
      }
    } catch {
      setAdminAuthError('Không thể kết nối tới Supabase. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handleRetryConnect = () => {
    setRetryCounter((c) => c + 1);
    pushToast('info', 'Đang kiểm tra lại kết nối tới Supabase...');
  };

  const handleEnterMember = (memberSession: MemberSession) => {
    setSession(memberSession);
    setSelectedDossierId(memberSession.dossierId);
    pushToast('info', 'Đã mở hồ sơ cá nhân. Đồng chí có thể tải tệp và nộp ngay.');
  };

  const handleEnterBranch = (branchSession: BranchSession) => {
    setSession(branchSession);
    setActiveNav('overview');
    setSelectedDossierId(null);
    pushToast(
      'success',
      `Đăng nhập thành công Cổng Đầu mối ${branchSession.branch}.`
    );
  };

  const handleLogout = async () => {
    if (session?.type === 'admin') {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore signOut errors
      }
    }
    setSession(null);
    setSelectedDossierId(null);
    setActiveNav('overview');
    setMobileMenuOpen(false);
    pushToast('info', 'Đã đăng xuất khỏi phiên làm việc.');
  };

  const availableYears = useMemo(() => {
    const set = new Set<number>([DEFAULT_YEAR]);
    for (const d of dossiers) {
      set.add(d.year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [dossiers]);

  const selectedDossier = useMemo(() => {
    if (!selectedDossierId) return null;
    return dossiers.find((d) => d.id === selectedDossierId) ?? null;
  }, [dossiers, selectedDossierId]);

  const handleNavigate = (section: NavSection) => {
    setActiveNav(section);
    setSelectedDossierId(null);
    setMobileMenuOpen(false);
  };

  const handleOpenDossier = (dossierId: string) => {
    const target = dossiers.find((d) => d.id === dossierId);
    if (!target) return;
    setSelectedDossierId(dossierId);
    setActiveNav(target.type === 'collective' ? 'collective' : 'individual');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateDossier = async (
    updated: Dossier,
    successMessage?: string
  ) => {
    if (!session) return;
    try {
      if (session.type === 'admin') {
        await saveDossierAsAdmin(updated);
      } else if (session.type === 'branch') {
        await saveDossierAsBranch(updated, session.branchProof);
      } else {
        await saveDossierAsMember(updated);
      }
      await refreshDossiersNow();
      if (successMessage) {
        pushToast('success', successMessage);
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Không thể lưu thay đổi lên Supabase (kiểm tra trạng thái khoá hồ sơ hoặc quyền truy cập).';
      pushToast('error', msg);
    }
  };

  const handleCommitExcelImport = async (
    dossiersToSave: Dossier[],
    summaryText: string
  ) => {
    try {
      await saveManyDossiersAsAdmin(dossiersToSave);
      await refreshDossiersNow();
      pushToast('success', summaryText);
    } catch {
      pushToast('error', 'Không thể lưu danh sách nhập từ Excel lên Supabase.');
    }
  };

  const handleDownloadFile = useCallback(
    (record: StoredFileRecord) => {
      const url = URL.createObjectURL(record.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = record.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      pushToast('info', `Đang tải xuống tệp "${record.name}".`);
    },
    [pushToast]
  );

  const handleConfirmResetData = async () => {
    if (session?.type !== 'admin') return;
    setIsResetting(true);
    try {
      await resetAllDataAsAdmin();
      await refreshDossiersNow();
      setSelectedDossierId(null);
      setSelectedYear(DEFAULT_YEAR);
      setActiveNav('overview');
      setShowResetConfirm(false);
      pushToast(
        'success',
        'Đã khôi phục 46 hồ sơ năm 2026 về trạng thái Chưa nộp trên Supabase.'
      );
    } catch {
      pushToast('error', 'Không thể khôi phục dữ liệu trên Supabase.');
    } finally {
      setIsResetting(false);
    }
  };

  // RENDER GATEWAY IF NOT SIGNED IN TO ANY PORTAL
  if (!session) {
    return (
      <>
        <PortalLoginGateway
          initialPortal={initialPortal}
          dossiers={dossiers}
          isLoadingData={isLoadingData}
          needsSchemaSetup={needsSchemaSetup}
          onRetryConnect={handleRetryConnect}
          onEnterMember={handleEnterMember}
          onEnterBranch={handleEnterBranch}
          onSignInAdmin={handleSignInAdmin}
          adminAuthLoading={adminAuthLoading}
          adminAuthError={adminAuthError}
          onNotify={pushToast}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // RENDER PORTAL 1: DEDICATED PARTY MEMBER SELF-SUBMISSION VIEW
  if (session.type === 'member') {
    const myDossier =
      dossiers.find((d) => d.id === session.dossierId) ?? null;

    return (
      <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#261617]">
        <header className="bg-[#8E1018] text-white border-b-4 border-[#F6CF62] sticky top-0 z-30 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <HammerSickleIcon className="w-10 h-10 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide text-[#F6CF62] truncate">
                  ĐẢNG BỘ TRƯỜNG THPT THANH HOÀ · CỔNG ĐẢNG VIÊN
                </div>
                <h1 className="text-base sm:text-lg font-bold text-white m-0 truncate">
                  {myDossier
                    ? `${getDossierDisplayName(myDossier)} (${myDossier.branch})`
                    : session.branch}
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F6CF62] text-[#8E1018] font-bold text-sm hover:bg-[#f2c444] whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Đổi người nộp
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
          {!myDossier ? (
            <div className="bg-white border border-[#b8424a] p-8 text-center space-y-3">
              <p className="text-lg font-bold text-[#8E1018] m-0">
                Không tìm thấy hồ sơ cá nhân đã chọn.
              </p>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="px-4 py-2 bg-[#8E1018] text-white font-bold"
              >
                Quay lại chọn tên
              </button>
            </div>
          ) : (
            <DossierDetailView
              dossier={myDossier}
              session={session}
              onUpdateDossier={handleUpdateDossier}
              onPreviewFile={setPreviewFile}
              onDownloadFile={handleDownloadFile}
              onNotify={pushToast}
            />
          )}
        </main>

        <footer className="px-4 py-3 border-t border-[#e3c8c9] bg-white text-center text-xs text-[#5c4748]">
          Đảng bộ Trường THPT Thanh Hoà · Cổng nộp hồ sơ Đảng viên (Lưu trữ đồng bộ trên Supabase)
        </footer>

        <FilePreviewModal
          fileRecord={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownloadFile}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // RENDER PORTAL 2 (BRANCH FOCAL POINT) & PORTAL 3 (ADMIN ĐẢNG UỶ)
  const scopedBranch = session.type === 'branch' ? session.branch : null;
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || session.type === 'admin'
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#261617]">
      {/* Top Crimson Header Bar */}
      <header className="bg-[#8E1018] text-white border-b-4 border-[#F6CF62] sticky top-0 z-30 shadow-sm">
        <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-2 text-[#F6CF62] hover:bg-[#730B12] border border-[#F6CF62]/50 shrink-0"
              aria-label="Mở hoặc đóng danh mục điều hướng"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('overview')}
              className="flex items-center gap-3 text-left min-w-0 hover:opacity-95"
            >
              <HammerSickleIcon className="w-10 h-10 sm:w-11 sm:h-11 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold tracking-wide text-[#F6CF62] truncate">
                  ĐẢNG BỘ TRƯỜNG THPT THANH HOÀ
                </div>
                <h1 className="text-base sm:text-xl font-bold text-white m-0 leading-tight truncate">
                  QUẢN LÝ HỒ SƠ KIỂM ĐIỂM CUỐI NĂM
                </h1>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right pl-2 border-l border-[#F6CF62]/40 hidden sm:block">
              <div className="text-sm sm:text-base font-bold text-[#F6CF62] leading-tight whitespace-nowrap">
                {session.type === 'admin'
                  ? 'Nguyễn Tiến Dương'
                  : `Đầu mối ${session.branch}`}
              </div>
              <div className="text-xs sm:text-[13px] text-white/95 leading-tight whitespace-nowrap">
                {session.type === 'admin'
                  ? 'Đảng uỷ viên phụ trách hồ sơ (Admin)'
                  : 'Bí thư / Thư ký chi bộ'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F6CF62] text-[#8E1018] font-bold text-xs sm:text-sm hover:bg-[#f2c444] whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace: Sidebar + Content */}
      <div className="flex-1 flex relative">
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#8E1018] text-white flex flex-col justify-between border-r-2 border-[#6b0b12] transition-transform duration-200 lg:translate-x-0 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="pt-4 lg:pt-5">
            <div className="px-4 pb-3 mb-2 border-b border-[#F6CF62]/30 flex items-center justify-between lg:block">
              <div className="text-xs font-bold tracking-wider text-[#F6CF62]">
                {session.type === 'admin'
                  ? 'QUẢN TRỊ ĐẢNG UỶ'
                  : `ĐẦU MỐI ${session.branch.toUpperCase()}`}
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden p-1 text-white hover:bg-[#730B12]"
                aria-label="Đóng thanh điều hướng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav aria-label="Điều hướng chính" className="px-2.5 space-y-1.5">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[16px] transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#F6CF62] text-[#8E1018] font-bold shadow-sm'
                        : 'text-white hover:bg-[#730B12] font-normal'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-[#F6CF62]/30 bg-[#7A0C14] space-y-2.5 text-xs">
            <div className="font-bold text-[#F6CF62]">
              Supabase trực tuyến · Năm {DEFAULT_YEAR}
            </div>
            <p className="m-0 text-white/90 leading-relaxed">
              {session.type === 'admin'
                ? 'Quyền cao nhất cấp Đảng uỷ. Cơ sở dữ liệu và kho tệp đồng bộ trên Supabase.'
                : `Phạm vi làm việc giới hạn trong ${session.branch}. Dữ liệu đồng bộ tức thì với Đảng uỷ.`}
            </p>
            {session.type === 'admin' && (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[#F6CF62]/70 text-[#F6CF62] hover:bg-[#8E1018] font-bold text-xs whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Khôi phục 46 hồ sơ mẫu 2026
              </button>
            )}
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Active Portal Status Strip */}
          <div className="bg-[#FDF6DE] border-b border-[#d5969a] px-4 lg:px-7 py-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[#6b0b12]">
            <div>
              <strong>
                {session.type === 'admin'
                  ? 'Cổng Admin Đảng uỷ (Quyền cao nhất)'
                  : `Cổng Đầu mối ${session.branch}`}
              </strong>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              <span>Lưu trữ tập trung trên Supabase (PostgreSQL &amp; Storage)</span>
            </div>
            {session.type === 'admin' && (
              <button
                type="button"
                onClick={() => handleNavigate('access')}
                className="inline-flex items-center gap-1 font-bold text-[#8E1018] underline hover:text-[#6b0b12] whitespace-nowrap"
              >
                <Link2 className="w-4 h-4" />
                Lấy link gửi Đảng viên &amp; Chi bộ
              </button>
            )}
          </div>

          <main className="flex-1 p-4 lg:p-7 max-w-[1440px] w-full mx-auto">
            {isLoadingData ? (
              <div className="py-16 text-center text-lg font-bold text-[#8E1018]">
                Đang đồng bộ dữ liệu hồ sơ kiểm điểm năm {DEFAULT_YEAR} từ Supabase...
              </div>
            ) : selectedDossier ? (
              <DossierDetailView
                dossier={selectedDossier}
                session={session}
                onBack={() => setSelectedDossierId(null)}
                onUpdateDossier={handleUpdateDossier}
                onPreviewFile={setPreviewFile}
                onDownloadFile={handleDownloadFile}
                onNotify={pushToast}
              />
            ) : activeNav === 'overview' ? (
              <OverviewPage
                dossiers={dossiers}
                availableYears={availableYears}
                selectedYear={selectedYear}
                onChangeYear={setSelectedYear}
                scopedBranch={scopedBranch}
                onNavigate={handleNavigate}
                onOpenDossier={handleOpenDossier}
              />
            ) : activeNav === 'collective' ? (
              <CollectiveListPage
                dossiers={dossiers}
                availableYears={availableYears}
                selectedYear={selectedYear}
                onChangeYear={setSelectedYear}
                scopedBranch={scopedBranch}
                onOpenDossier={handleOpenDossier}
              />
            ) : activeNav === 'individual' ? (
              <IndividualListPage
                dossiers={dossiers}
                availableYears={availableYears}
                selectedYear={selectedYear}
                onChangeYear={setSelectedYear}
                scopedBranch={scopedBranch}
                canImportExcel={session.type === 'admin'}
                onOpenDossier={handleOpenDossier}
                onCommitExcelImport={handleCommitExcelImport}
                onNotify={pushToast}
              />
            ) : activeNav === 'access' && session.type === 'admin' ? (
              <AdminPortalLinksPage onNotify={pushToast} />
            ) : (
              <SummaryExportPage
                dossiers={dossiers}
                availableYears={availableYears}
                selectedYear={selectedYear}
                onChangeYear={setSelectedYear}
                scopedBranch={scopedBranch}
                onOpenDossier={handleOpenDossier}
                onNotify={pushToast}
              />
            )}
          </main>

          <footer className="px-4 lg:px-7 py-3 border-t border-[#e3c8c9] bg-white text-xs text-[#5c4748] flex flex-wrap items-center justify-between gap-2">
            <span>
              Đảng bộ Trường THPT Thanh Hoà · Hệ thống Quản lý hồ sơ kiểm điểm cuối năm
            </span>
            <span>Lưu trữ tập trung trên Supabase · Đồng bộ đa thiết bị</span>
          </footer>
        </div>
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        fileRecord={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownloadFile}
      />

      {/* Admin Reset Data Confirmation Modal */}
      {showResetConfirm && session.type === 'admin' && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận khôi phục dữ liệu mẫu năm 2026"
        >
          <div className="bg-white border-2 border-[#8E1018] max-w-md w-full shadow-xl">
            <div className="bg-[#8E1018] text-white px-5 py-3 font-bold text-lg border-b-2 border-[#F6CF62]">
              Khôi phục 46 hồ sơ mẫu năm 2026
            </div>
            <div className="p-5 text-[15px] text-[#2b1416] space-y-2">
              <p className="m-0">
                Thao tác này sẽ xoá toàn bộ dữ liệu hồ sơ và tệp đính kèm hiện có trên Supabase để khởi tạo lại đúng 46 hồ sơ ban đầu (6 hồ sơ tập thể: Đảng bộ, Chi bộ 1–4, UBKT Đảng uỷ và 40 hồ sơ cá nhân; tất cả ở trạng thái Chưa nộp).
              </p>
              <p className="m-0 font-bold text-[#8E1018]">
                Bạn có chắc chắn muốn tiếp tục?
              </p>
            </div>
            <div className="px-5 py-3 bg-[#FBF7EC] border-t border-[#d5969a] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmResetData()}
                disabled={isResetting}
                className="px-4 py-1.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50"
              >
                {isResetting ? 'Đang khôi phục...' : 'Xác nhận khôi phục'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
