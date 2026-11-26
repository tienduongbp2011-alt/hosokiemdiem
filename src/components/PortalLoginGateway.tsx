import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Mail,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
} from 'lucide-react';
import { SUPABASE_SETUP_SQL } from '../data/supabaseSetupSql';
import { verifyBranchPassword } from '../services/supabaseService';
import { isSupabaseConfigured } from '../supabase';
import {
  BRANCH_LIST,
  BranchSession,
  BranchUnitKey,
  BranchUnitName,
  Dossier,
  MemberSession,
  PortalMode,
  UNIT_KEY_MAP,
} from '../types';
import { HammerSickleIcon } from './HammerSickleIcon';

interface PortalLoginGatewayProps {
  initialPortal: PortalMode;
  dossiers: Dossier[];
  isLoadingData: boolean;
  needsSchemaSetup: boolean;
  onRetryConnect: () => void;
  onEnterMember: (session: MemberSession) => void;
  onEnterBranch: (session: BranchSession) => void;
  onSignInAdmin: (email: string, password: string) => Promise<void>;
  adminAuthLoading: boolean;
  adminAuthError: string;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const PortalLoginGateway: React.FC<PortalLoginGatewayProps> = ({
  initialPortal,
  dossiers,
  isLoadingData,
  needsSchemaSetup,
  onRetryConnect,
  onEnterMember,
  onEnterBranch,
  onSignInAdmin,
  adminAuthLoading,
  adminAuthError,
  onNotify,
}) => {
  const resolveTab = (mode: PortalMode): 'member' | 'branch' | 'admin' =>
    mode === 'branch' ? 'branch' : mode === 'admin' ? 'admin' : 'member';

  const [activeTab, setActiveTab] = useState<'member' | 'branch' | 'admin'>(
    () => resolveTab(initialPortal)
  );
  const [showAllTabs, setShowAllTabs] = useState<boolean>(
    initialPortal === 'gateway'
  );

  useEffect(() => {
    setActiveTab(resolveTab(initialPortal));
    setShowAllTabs(initialPortal === 'gateway');
  }, [initialPortal]);

  // Member Portal state
  const [memberBranch, setMemberBranch] = useState<BranchUnitName>('Chi bộ 1');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');

  // Branch Focal Point state
  const [focalBranch, setFocalBranch] = useState<BranchUnitName>('Chi bộ 1');
  const [branchPassword, setBranchPassword] = useState('');
  const [showBranchPassword, setShowBranchPassword] = useState(false);
  const [branchError, setBranchError] = useState('');
  const [branchChecking, setBranchChecking] = useState(false);

  // Admin Supabase Auth state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Copy SQL state
  const [copiedSql, setCopiedSql] = useState(false);

  const memberOptions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return dossiers
      .filter((d) => d.type === 'individual' && d.branch === memberBranch)
      .filter((d) => {
        if (!q) return true;
        return `${d.code} ${d.fullName}`.toLowerCase().includes(q);
      });
  }, [dossiers, memberBranch, memberSearch]);

  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = dossiers.find((d) => d.id === selectedMemberId);
    if (!chosen || chosen.type !== 'individual') return;
    onEnterMember({
      type: 'member',
      dossierId: chosen.id,
      branch: chosen.branch as BranchUnitName,
      unitKey: chosen.unitKey as BranchUnitKey,
    });
  };

  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBranchError('');
    if (!isSupabaseConfigured) {
      setBranchError(
        'Chưa cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
      );
      return;
    }
    if (!branchPassword.trim()) {
      setBranchError('Vui lòng nhập mật khẩu Đầu mối Chi bộ.');
      return;
    }

    const unitKey = UNIT_KEY_MAP[focalBranch] as BranchUnitKey;
    setBranchChecking(true);
    try {
      const res = await verifyBranchPassword(unitKey, branchPassword);
      if (res.notInitialized) {
        setBranchError(
          'Hệ thống Supabase chưa được khởi tạo dữ liệu. Vui lòng chạy mã SQL khởi tạo và đăng nhập Cổng 3 (Admin Đảng uỷ) lần đầu.'
        );
      } else if (!res.ok) {
        setBranchError(
          'Mật khẩu chưa chính xác. Vui lòng kiểm tra lại với Đảng uỷ.'
        );
      } else {
        onEnterBranch({
          type: 'branch',
          branch: focalBranch,
          unitKey,
          branchProof: res.hash,
        });
      }
    } catch {
      setBranchError(
        'Không thể xác thực mật khẩu trên Supabase. Vui lòng thử lại.'
      );
    } finally {
      setBranchChecking(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword) return;
    await onSignInAdmin(adminEmail.trim(), adminPassword);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setCopiedSql(true);
      onNotify('success', 'Đã sao chép toàn bộ mã SQL khởi tạo Supabase.');
      window.setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      onNotify(
        'error',
        'Trình duyệt chặn tự sao chép. Bạn có thể mở tệp supabase_setup.sql để lấy mã SQL.'
      );
    }
  };

  const switchPortalUrl = (tab: 'member' | 'branch' | 'admin') => {
    setActiveTab(tab);
    const param =
      tab === 'member' ? 'dang-vien' : tab === 'branch' ? 'chi-bo' : 'admin';
    const url = new URL(window.location.href);
    url.searchParams.set('cong', param);
    window.history.replaceState({}, '', url.toString());
  };

  const hasSeededData = dossiers.length > 0;
  const isDedicatedAdmin = !showAllTabs && activeTab === 'admin';
  const isDedicatedBranch = !showAllTabs && activeTab === 'branch';
  const isDedicatedMember = !showAllTabs && activeTab === 'member';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#261617]">
      {/* Official Crimson Header */}
      <header className="bg-[#8E1018] text-white border-b-4 border-[#F6CF62] shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            <HammerSickleIcon className="w-12 h-12 shrink-0" />
            <div>
              <div className="text-sm font-bold tracking-wide text-[#F6CF62]">
                ĐẢNG BỘ TRƯỜNG THPT THANH HOÀ
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white m-0 leading-tight">
                QUẢN LÝ HỒ SƠ KIỂM ĐIỂM CUỐI NĂM
              </h1>
            </div>
          </div>
          <div className="text-center sm:text-right sm:border-l sm:border-[#F6CF62]/40 sm:pl-4">
            <div className="text-base font-bold text-[#F6CF62]">
              Nguyễn Tiến Dương
            </div>
            <div className="text-xs text-white/95">
              Đảng uỷ viên phụ trách hồ sơ
            </div>
          </div>
        </div>
      </header>

      {/* Center Login Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-white border-2 border-[#8E1018] shadow-md">
            {/* Dedicated Portal Header Bar OR 3-Portal Switcher Tabs */}
            {showAllTabs ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 border-b-2 border-[#8E1018] bg-[#FDF6DE]">
                <button
                  type="button"
                  onClick={() => switchPortalUrl('member')}
                  className={`px-4 py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 transition-colors border-b sm:border-b-0 sm:border-r border-[#d5969a] ${
                    activeTab === 'member'
                      ? 'bg-[#8E1018] text-[#F6CF62]'
                      : 'text-[#6b0b12] hover:bg-[#FBF0C9]'
                  }`}
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>1. Cổng Đảng viên</span>
                </button>

                <button
                  type="button"
                  onClick={() => switchPortalUrl('branch')}
                  className={`px-4 py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 transition-colors border-b sm:border-b-0 sm:border-r border-[#d5969a] ${
                    activeTab === 'branch'
                      ? 'bg-[#8E1018] text-[#F6CF62]'
                      : 'text-[#6b0b12] hover:bg-[#FBF0C9]'
                  }`}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>2. Đầu mối Chi bộ</span>
                </button>

                <button
                  type="button"
                  onClick={() => switchPortalUrl('admin')}
                  className={`px-4 py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 transition-colors ${
                    activeTab === 'admin'
                      ? 'bg-[#8E1018] text-[#F6CF62]'
                      : 'text-[#6b0b12] hover:bg-[#FBF0C9]'
                  }`}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>3. Admin Đảng uỷ</span>
                </button>
              </div>
            ) : (
              <div className="bg-[#8E1018] text-[#F6CF62] px-6 py-3.5 border-b-2 border-[#F6CF62] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 font-bold text-base sm:text-lg">
                  {isDedicatedAdmin && <Shield className="w-5 h-5 shrink-0" />}
                  {isDedicatedBranch && (
                    <Building2 className="w-5 h-5 shrink-0" />
                  )}
                  {isDedicatedMember && (
                    <UserCheck className="w-5 h-5 shrink-0" />
                  )}
                  <span>
                    {isDedicatedAdmin
                      ? 'ĐĂNG NHẬP CỔNG ADMIN ĐẢNG UỶ'
                      : isDedicatedBranch
                        ? 'ĐĂNG NHẬP CỔNG ĐẦU MỐI CHI BỘ'
                        : 'CỔNG NỘP HỒ SƠ ĐẢNG VIÊN'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllTabs(true)}
                  className="text-xs font-bold text-white underline hover:text-[#F6CF62] whitespace-nowrap"
                >
                  Đổi cổng đăng nhập
                </button>
              </div>
            )}

            <div className="p-6 sm:p-7">
              {/* Missing Env Vars Alert (e.g. Vercel deployment without env vars) */}
              {!isSupabaseConfigured && (
                <div className="mb-5 p-4 bg-[#FDF1F2] border-2 border-[#8E1018] text-[#6b0b12] text-[14px] space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-[#8E1018]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Chưa cấu hình biến môi trường Supabase trên máy chủ web</span>
                  </div>
                  <p className="m-0">
                    Vào trang quản trị <strong>Vercel → Project Settings → Environment Variables</strong>, thêm 2 biến{' '}
                    <code className="px-1 bg-white border border-[#d5969a]">VITE_SUPABASE_URL</code> và{' '}
                    <code className="px-1 bg-white border border-[#d5969a]">VITE_SUPABASE_ANON_KEY</code> rồi bấm{' '}
                    <strong>Redeploy</strong>.
                  </p>
                </div>
              )}

              {/* PORTAL 1: ĐẢNG VIÊN */}
              {activeTab === 'member' && (
                <form onSubmit={handleMemberSubmit} className="space-y-5">
                  <div className="border-b border-[#e3c8c9] pb-3">
                    <h2 className="text-xl font-bold text-[#8E1018] m-0">
                      Cổng nộp hồ sơ dành cho Đảng viên
                    </h2>
                    <p className="text-[15px] text-[#594446] mt-1 mb-0">
                      Chọn đúng Chi bộ và Họ tên của đồng chí trong danh sách dưới đây để vào trực tiếp hồ sơ cá nhân và tải tệp lên.
                    </p>
                  </div>

                  {isLoadingData ? (
                    <div className="py-8 text-center text-[#8E1018] font-bold">
                      Đang tải danh sách đảng viên từ cơ sở dữ liệu Supabase...
                    </div>
                  ) : !hasSeededData ? (
                    <div className="bg-[#FCF8E8] border border-[#D4A73E] p-4 text-[15px] text-[#4b3512] space-y-2">
                      <p className="m-0 font-bold text-[#8E1018]">
                        Danh sách 46 hồ sơ năm 2026 chưa được khởi tạo trên Supabase.
                      </p>
                      <p className="m-0">
                        Vui lòng đăng nhập <strong>Cổng Admin Đảng uỷ</strong> lần đầu để tự động khởi tạo đầy đủ 46 hồ sơ và mật khẩu 4 Chi bộ.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[15px] font-bold text-[#6b0b12] mb-1.5">
                          Bước 1: Chọn Chi bộ đang sinh hoạt
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {BRANCH_LIST.map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => {
                                setMemberBranch(b);
                                setSelectedMemberId('');
                                setMemberSearch('');
                              }}
                              className={`px-3 py-2 border font-bold text-[15px] transition-colors ${
                                memberBranch === b
                                  ? 'bg-[#F6CF62] text-[#8E1018] border-[#8E1018]'
                                  : 'bg-white text-[#4a2629] border-[#d5969a] hover:bg-[#FDF9EE]'
                              }`}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="member-search-input"
                          className="block text-[15px] font-bold text-[#6b0b12]"
                        >
                          Bước 2: Chọn tên của đồng chí trong danh sách ({memberBranch})
                        </label>

                        <div className="relative">
                          <Search className="w-4 h-4 text-[#8E1018] absolute left-3 top-3 pointer-events-none" />
                          <input
                            id="member-search-input"
                            type="text"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Gõ nhanh họ tên hoặc mã hồ sơ (VD: CB1-01)..."
                            className="w-full pl-9 pr-3 py-2 border border-[#b8424a] bg-white text-[15px]"
                          />
                        </div>

                        <select
                          size={Math.min(7, Math.max(4, memberOptions.length))}
                          value={selectedMemberId}
                          onChange={(e) => setSelectedMemberId(e.target.value)}
                          className="w-full border border-[#8E1018] bg-white p-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
                          required
                        >
                          {memberOptions.length === 0 ? (
                            <option value="" disabled>
                              Không tìm thấy đảng viên phù hợp
                            </option>
                          ) : (
                            memberOptions.map((m) => (
                              <option
                                key={m.id}
                                value={m.id}
                                className="py-1.5 px-2"
                              >
                                {m.fullName.trim()
                                  ? `${m.fullName.trim()} (${m.code}) — ${m.status}`
                                  : `${m.code} (Chưa cập nhật họ tên) — ${m.status}`}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <button
                        type="submit"
                        disabled={!selectedMemberId}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#8E1018] text-white text-base font-bold hover:bg-[#730B12] disabled:opacity-50"
                      >
                        <LogIn className="w-5 h-5 text-[#F6CF62]" />
                        Vào nộp hồ sơ cá nhân ngay
                      </button>
                    </>
                  )}
                </form>
              )}

              {/* PORTAL 2: ĐẦU MỐI CHI BỘ */}
              {activeTab === 'branch' && (
                <form onSubmit={handleBranchSubmit} className="space-y-5">
                  <div className="border-b border-[#e3c8c9] pb-3">
                    <h2 className="text-xl font-bold text-[#8E1018] m-0">
                      Cổng đăng nhập Đầu mối Chi bộ (Bí thư / Thư ký chi bộ)
                    </h2>
                    <p className="text-[15px] text-[#594446] mt-1 mb-0">
                      Dành cho Bí thư hoặc Thư ký chi bộ kiểm tra hồ sơ đảng viên, ghi mức chi bộ đề nghị và nộp hồ sơ tập thể lên Đảng uỷ.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="branch-login-unit"
                      className="block text-[15px] font-bold text-[#6b0b12] mb-1.5"
                    >
                      Chọn Chi bộ phụ trách
                    </label>
                    <select
                      id="branch-login-unit"
                      value={focalBranch}
                      onChange={(e) => {
                        setFocalBranch(e.target.value as BranchUnitName);
                        setBranchError('');
                      }}
                      className="w-full px-3 py-2.5 border border-[#8E1018] bg-white text-[15px] font-bold"
                    >
                      {BRANCH_LIST.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="branch-login-password"
                      className="block text-[15px] font-bold text-[#6b0b12] mb-1.5"
                    >
                      Mật khẩu truy cập Chi bộ
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#8E1018] absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="branch-login-password"
                        type={showBranchPassword ? 'text' : 'password'}
                        value={branchPassword}
                        onChange={(e) => {
                          setBranchPassword(e.target.value);
                          setBranchError('');
                        }}
                        placeholder="Nhập mật khẩu do Admin Đảng uỷ cấp..."
                        className="w-full pl-9 pr-11 py-2.5 border border-[#8E1018] bg-white text-[15px]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowBranchPassword((v) => !v)}
                        className="absolute right-2.5 top-2 p-1 text-[#6b0b12] hover:bg-[#FBF0C9]"
                        aria-label={
                          showBranchPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
                        }
                      >
                        {showBranchPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {branchError && (
                    <div className="p-3 bg-[#FDF1F2] border border-[#8E1018] text-[#8E1018] text-[14px] font-semibold">
                      {branchError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={branchChecking}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#8E1018] text-white text-base font-bold hover:bg-[#730B12] disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5 text-[#F6CF62]" />
                    {branchChecking
                      ? 'Đang xác thực...'
                      : `Đăng nhập Đầu mối ${focalBranch}`}
                  </button>
                </form>
              )}

              {/* PORTAL 3: ADMIN ĐẢNG UỶ (SUPABASE AUTH EMAIL + PASSWORD) */}
              {activeTab === 'admin' && (
                <form
                  onSubmit={(e) => void handleAdminSubmit(e)}
                  className="space-y-5"
                >
                  <div className="border-b border-[#e3c8c9] pb-3">
                    <h2 className="text-xl font-bold text-[#8E1018] m-0">
                      Cổng Quản trị cao nhất – Admin Đảng uỷ
                    </h2>
                    <p className="text-[15px] text-[#594446] mt-1 mb-0">
                      Nhập Email và Mật khẩu tài khoản quản trị của đồng chí{' '}
                      <strong>Nguyễn Tiến Dương</strong> để vào hệ thống quản trị toàn Đảng bộ.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-login-email"
                      className="block text-[15px] font-bold text-[#6b0b12] mb-1.5"
                    >
                      Email đăng nhập Admin
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#8E1018] absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="admin-login-email"
                        type="email"
                        autoComplete="email"
                        autoFocus={isDedicatedAdmin}
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="Nhập email Admin đã tạo trên Supabase..."
                        className="w-full pl-9 pr-3 py-2.5 border border-[#8E1018] bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-login-password"
                      className="block text-[15px] font-bold text-[#6b0b12] mb-1.5"
                    >
                      Mật khẩu Admin
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#8E1018] absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="admin-login-password"
                        type={showAdminPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Nhập mật khẩu tài khoản Admin..."
                        className="w-full pl-9 pr-11 py-2.5 border border-[#8E1018] bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword((v) => !v)}
                        className="absolute right-2.5 top-2 p-1 text-[#6b0b12] hover:bg-[#FBF0C9]"
                        aria-label={
                          showAdminPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
                        }
                      >
                        {showAdminPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {adminAuthError && (
                    <div className="p-3 bg-[#FDF1F2] border border-[#8E1018] text-[#8E1018] text-[14px] font-semibold">
                      {adminAuthError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={adminAuthLoading}
                    className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-[#8E1018] text-white text-base font-bold hover:bg-[#730B12] disabled:opacity-50"
                  >
                    <Shield className="w-5 h-5 text-[#F6CF62]" />
                    {adminAuthLoading
                      ? 'Đang xác thực trên Supabase...'
                      : 'Đăng nhập Cổng Admin Đảng uỷ'}
                  </button>

                  <div className="bg-[#FCF8E8] border border-[#D4A73E] p-3.5 text-[13.5px] text-[#4b3512]">
                    Tài khoản Admin được tạo tại{' '}
                    <strong>
                      Supabase → Authentication → Users → Add user
                    </strong>{' '}
                    (tích <em>Auto Confirm User</em>). Lần đầu đăng nhập sẽ tự động khởi tạo đủ 46 hồ sơ năm 2026 và mật khẩu 4 Chi bộ.
                  </div>
                </form>
              )}

              {/* Quick portal links at bottom when in dedicated mode */}
              {!showAllTabs && (
                <div className="mt-6 pt-3 border-t border-[#eed1d3] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[#665052]">
                  <span>Chuyển nhanh cổng khác:</span>
                  <button
                    type="button"
                    onClick={() => switchPortalUrl('member')}
                    className={`underline font-bold ${
                      activeTab === 'member'
                        ? 'text-[#8E1018]'
                        : 'text-[#594446] hover:text-[#8E1018]'
                    }`}
                  >
                    Cổng Đảng viên
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => switchPortalUrl('branch')}
                    className={`underline font-bold ${
                      activeTab === 'branch'
                        ? 'text-[#8E1018]'
                        : 'text-[#594446] hover:text-[#8E1018]'
                    }`}
                  >
                    Đầu mối Chi bộ
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => switchPortalUrl('admin')}
                    className={`underline font-bold ${
                      activeTab === 'admin'
                        ? 'text-[#8E1018]'
                        : 'text-[#594446] hover:text-[#8E1018]'
                    }`}
                  >
                    Admin Đảng uỷ
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* One-time Supabase SQL Setup Banner placed BELOW the login card so login inputs stay front-and-center */}
          {needsSchemaSetup && isSupabaseConfigured && (
            <div className="bg-[#FCF8E8] border-2 border-[#8E1018] p-4 shadow-sm space-y-2.5">
              <div className="flex items-center gap-2 text-[#8E1018] font-bold text-base">
                <Database className="w-5 h-5 shrink-0" />
                <span>Chưa chạy mã SQL khởi tạo bảng trên Supabase (làm 1 lần)</span>
              </div>
              <p className="text-[14px] text-[#3d2817] m-0">
                Bấm nút dưới đây để sao chép mã SQL, dán vào{' '}
                <strong>Supabase → SQL Editor → New query</strong> và bấm{' '}
                <strong>Run</strong>.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopySql()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#8E1018] text-white font-bold text-xs sm:text-sm hover:bg-[#730B12]"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-4 h-4 text-[#F6CF62]" />
                      Đã sao chép mã SQL
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-[#F6CF62]" />
                      Sao chép mã SQL khởi tạo
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onRetryConnect}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-xs sm:text-sm hover:bg-[#FBF0C9]"
                >
                  <RefreshCw className="w-4 h-4" />
                  Kiểm tra lại kết nối
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-3 px-4 text-center text-xs text-[#5c4748] border-t border-[#e3c8c9] bg-white">
        Đảng bộ Trường THPT Thanh Hoà · Hệ thống Quản lý hồ sơ kiểm điểm cuối năm · Lưu trữ Supabase đồng bộ đa thiết bị
      </footer>
    </div>
  );
};
