import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Search,
  Send,
  ShieldCheck,
  Vote,
} from 'lucide-react';
import {
  castSecretBallot,
  isMissingVotingTableError,
  subscribeVotingRealtime,
} from '../services/votingService';
import {
  SHORT_RATING_OPTIONS,
  ShortRating,
  VOTING_CATEGORY_META,
  VoterAttendance,
  VotingSession,
  VotingVoter,
  hasIndependentUbktRule,
  isMultiBranchCollectiveSession,
} from '../types';
import { HammerSickleIcon } from './HammerSickleIcon';

interface VotingBoothPageProps {
  initialSessionId?: string;
  onExitToGateway: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

function formatDateLineVN(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `Thiện Hưng, ngày ${Number(parts[2])} tháng ${Number(parts[1])} năm ${parts[0]}`;
  }
  const now = new Date();
  return `Thiện Hưng, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
}

export const VotingBoothPage: React.FC<VotingBoothPageProps> = ({
  initialSessionId,
  onExitToGateway,
  onNotify,
}) => {
  const [sessions, setSessions] = useState<VotingSession[]>([]);
  const [attendance, setAttendance] = useState<VoterAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [missingTables, setMissingTables] = useState(false);

  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId ?? ''
  );
  const [voterSearch, setVoterSearch] = useState('');
  const [selectedVoter, setSelectedVoter] = useState<VotingVoter | null>(null);
  const [choices, setChoices] = useState<Record<string, ShortRating>>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSessionTitle, setCompletedSessionTitle] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const unsub = subscribeVotingRealtime(
      (list, att) => {
        setSessions(list);
        setAttendance(att);
        setMissingTables(false);
        setIsLoading(false);
      },
      (err) => {
        setIsLoading(false);
        if (isMissingVotingTableError(err)) {
          setMissingTables(true);
        }
      }
    );
    return () => unsub();
  }, []);

  const openSessions = useMemo(
    () => sessions.filter((s) => s.status === 'open'),
    [sessions]
  );

  // Auto-select if URL specifies ?phien= or only 1 open session exists
  useEffect(() => {
    if (selectedSessionId) return;
    if (initialSessionId && openSessions.some((s) => s.id === initialSessionId)) {
      setSelectedSessionId(initialSessionId);
    } else if (openSessions.length === 1) {
      setSelectedSessionId(openSessions[0].id);
    }
  }, [initialSessionId, openSessions, selectedSessionId]);

  const activeSession = useMemo(
    () => openSessions.find((s) => s.id === selectedSessionId) ?? null,
    [openSessions, selectedSessionId]
  );

  const votedVoterIds = useMemo(() => {
    if (!activeSession) return new Set<string>();
    return new Set(
      attendance
        .filter((a) => a.sessionId === activeSession.id)
        .map((a) => a.voterId)
    );
  }, [attendance, activeSession]);

  const filteredVoters = useMemo(() => {
    if (!activeSession) return [];
    const q = voterSearch.trim().toLowerCase();
    return activeSession.eligibleVoters.filter((v) => {
      if (!q) return true;
      return `${v.name} ${v.code ?? ''} ${v.branch ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [activeSession, voterSearch]);

  // Compute HTXSNV limit stats (with special support for 4 Chi bộ + independent UBKT)
  const totalCandidates = activeSession?.candidates.length ?? 0;
  const isMultiBranch = activeSession
    ? isMultiBranchCollectiveSession(activeSession)
    : false;
  const ubktIndependent = activeSession
    ? hasIndependentUbktRule(activeSession)
    : false;

  const branchCandidates = activeSession
    ? activeSession.candidates.filter((c) => c.group === 'branch')
    : [];
  const filledCount = activeSession
    ? activeSession.candidates.filter((c) => Boolean(choices[c.id])).length
    : 0;
  const htxsnvSelectedCount = activeSession
    ? activeSession.candidates.filter((c) => choices[c.id] === 'HTXSNV').length
    : 0;
  const branchHtxsnvCount = ubktIndependent
    ? branchCandidates.filter((c) => choices[c.id] === 'HTXSNV').length
    : htxsnvSelectedCount;

  const maxHtxsnvAllowed = ubktIndependent
    ? 1
    : activeSession && totalCandidates >= 2
      ? Math.max(
          1,
          Math.floor((totalCandidates * activeSession.maxHtxsnvPercent) / 100)
        )
      : totalCandidates;

  const activeTrackedCount = ubktIndependent
    ? branchHtxsnvCount
    : htxsnvSelectedCount;

  const exceedsHtxsnv =
    Boolean(activeSession) &&
    activeSession!.htxsnvMode !== 'off' &&
    totalCandidates >= 2 &&
    activeTrackedCount > maxHtxsnvAllowed;

  const handleSelectChoice = (candId: string, rating: ShortRating) => {
    if (!activeSession) return;
    const cand = activeSession.candidates.find((c) => c.id === candId);
    const subjectToCap = !ubktIndependent || cand?.group === 'branch';

    if (
      rating === 'HTXSNV' &&
      subjectToCap &&
      activeSession.htxsnvMode === 'strict' &&
      totalCandidates >= 2 &&
      choices[candId] !== 'HTXSNV' &&
      activeTrackedCount >= maxHtxsnvAllowed
    ) {
      onNotify(
        'error',
        ubktIndependent
          ? 'Trong nhóm 4 Chi bộ trực thuộc chỉ được chọn tối đa 01 Chi bộ Hoàn thành xuất sắc nhiệm vụ (tập thể UBKT được đánh giá độc lập).'
          : isMultiBranch
            ? `Phiên này chỉ cho phép chọn tối đa ${maxHtxsnvAllowed} tập thể Hoàn thành xuất sắc nhiệm vụ.`
            : `Phiên này giới hạn tối đa ${maxHtxsnvAllowed} mức Hoàn thành xuất sắc nhiệm vụ (${activeSession.maxHtxsnvPercent}%).`
      );
      return;
    }
    setChoices((prev) => ({ ...prev, [candId]: rating }));
  };

  const handleRequestSubmit = () => {
    if (!activeSession || !selectedVoter) return;
    if (filledCount < totalCandidates) {
      onNotify(
        'error',
        `Đồng chí mới tích ${filledCount}/${totalCandidates} dòng. Vui lòng tích đủ tất cả các dòng trên phiếu.`
      );
      return;
    }
    if (activeSession.htxsnvMode === 'strict' && exceedsHtxsnv) {
      onNotify(
        'error',
        ubktIndependent
          ? 'Nhóm 4 Chi bộ chỉ được chọn tối đa 01 Chi bộ mức Hoàn thành xuất sắc nhiệm vụ.'
          : `Số lượng chọn HTXSNV (${activeTrackedCount}) vượt quá mức tối đa ${maxHtxsnvAllowed}.`
      );
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmCastBallot = async () => {
    if (!activeSession || !selectedVoter) return;
    setIsSubmitting(true);
    try {
      await castSecretBallot({
        sessionId: activeSession.id,
        voterId: selectedVoter.id,
        voterName: selectedVoter.name,
        choices,
      });
      setCompletedSessionTitle(activeSession.title);
      setShowConfirmModal(false);
      setSelectedVoter(null);
      setChoices({});
      onNotify('success', 'Đã bỏ phiếu kín thành công!');
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Không thể gửi phiếu biểu quyết. Vui lòng thử lại.';
      onNotify('error', msg);
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#261617]">
      {/* Official Crimson Header */}
      <header className="bg-[#8E1018] text-white border-b-4 border-[#F6CF62] sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <HammerSickleIcon className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-wide text-[#F6CF62] truncate">
                ĐẢNG BỘ TRƯỜNG THPT THANH HOÀ · BỎ PHIẾU KÍN TRỰC TUYẾN
              </div>
              <h1 className="text-base sm:text-lg font-bold text-white m-0 truncate">
                PHIẾU BIỂU QUYẾT XẾP LOẠI CUỐI NĂM (MẪU 4 &amp; MẪU 5)
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitToGateway}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F6CF62] text-[#8E1018] font-bold text-xs sm:text-sm hover:bg-[#f2c444] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Về cổng chính
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {completedSessionTitle ? (
          <div className="bg-white border-2 border-[#166534] p-8 text-center space-y-4 shadow-sm">
            <CheckCircle2 className="w-14 h-14 text-[#166534] mx-auto" />
            <h2 className="text-2xl font-bold text-[#166534] m-0">
              ĐÃ BỎ PHIẾU KÍN THÀNH CÔNG
            </h2>
            <p className="text-[16px] text-[#2b1416] max-w-xl mx-auto m-0">
              Lá phiếu của đồng chí trong phiên{' '}
              <strong>{completedSessionTitle}</strong> đã được đưa vào hòm phiếu kín hoàn toàn ẩn danh <em>(Không ký tên)</em>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCompletedSessionTitle('');
                  setSelectedVoter(null);
                  setChoices({});
                }}
                className="px-5 py-2.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12]"
              >
                Chọn phiên bỏ phiếu khác
              </button>
              <button
                type="button"
                onClick={onExitToGateway}
                className="px-5 py-2.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                Quay về trang chủ
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="bg-white border border-[#b8424a] p-10 text-center text-[#8E1018] font-bold text-lg">
            Đang tải danh sách phiên bỏ phiếu đang mở...
          </div>
        ) : missingTables ? (
          <div className="bg-[#FCF8E8] border-2 border-[#8E1018] p-6 space-y-2 text-[15px] text-[#3d2817]">
            <div className="font-bold text-[#8E1018] text-lg">
              Phân hệ Bỏ phiếu trực tuyến chưa được khởi tạo trên Supabase
            </div>
            <p className="m-0">
              Vui lòng đăng nhập Cổng <strong>Admin Đảng uỷ</strong> → mục{' '}
              <strong>Bỏ phiếu trực tuyến</strong> để sao chép mã SQL khởi tạo và chạy 1 lần trong Supabase SQL Editor.
            </p>
          </div>
        ) : openSessions.length === 0 ? (
          <div className="bg-white border-2 border-[#b8424a] p-8 text-center space-y-3">
            <Vote className="w-12 h-12 text-[#8E1018] mx-auto" />
            <h2 className="text-xl font-bold text-[#6b0b12] m-0">
              Hiện chưa có phiên bỏ phiếu nào đang mở
            </h2>
            <p className="text-[15px] text-[#594446] max-w-lg mx-auto m-0">
              Khi Chủ trì / Bí thư chi bộ hoặc Admin Đảng uỷ bấm <strong>Mở hòm phiếu</strong> tại hội nghị, phiên bỏ phiếu sẽ tự động xuất hiện ngay tại đây.
            </p>
          </div>
        ) : !selectedVoter ? (
          /* STEP 1 & 2: Pick Active Session & Pick Name Directly (NO ROOM PIN) */
          <div className="space-y-5">
            {/* Session Picker */}
            <section className="bg-white border-2 border-[#8E1018] p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#8E1018] m-0 pb-2 border-b border-[#e3c8c9]">
                Bước 1: Chọn phiên bỏ phiếu đang mở ({openSessions.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {openSessions.map((s) => {
                  const isSelected = activeSession?.id === s.id;
                  const votedCnt = attendance.filter(
                    (a) => a.sessionId === s.id
                  ).length;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSessionId(s.id);
                        setVoterSearch('');
                      }}
                      className={`p-4 text-left border-2 transition-colors ${
                        isSelected
                          ? 'bg-[#FDF6DE] border-[#8E1018]'
                          : 'bg-white border-[#d5969a] hover:bg-[#FAF8F3]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#8E1018] mb-1">
                        <span>
                          {s.template === 'mau4' ? 'MẪU 4 (Tập thể)' : 'MẪU 5 (Cá nhân)'} · {s.unitName}
                        </span>
                        <span className="tabular-nums text-[#166534]">
                          Đã bỏ: {votedCnt}/{s.eligibleVoters.length}
                        </span>
                      </div>
                      <div className="font-bold text-[16px] text-[#261617]">
                        {s.title}
                      </div>
                      <div className="text-xs text-[#5c4748] mt-1">
                        {VOTING_CATEGORY_META[s.category].label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Voter Name Picker (No PIN!) */}
            {activeSession && (
              <section className="bg-white border-2 border-[#8E1018] p-5 space-y-4">
                <div className="border-b border-[#e3c8c9] pb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-[#8E1018] m-0">
                      Bước 2: Chọn tên đồng chí để vào bỏ phiếu kín ngay
                    </h2>
                    <p className="text-sm text-[#594446] m-0 mt-0.5">
                      Không cần mã phòng · Hệ thống chỉ ghi nhận đồng chí đã tham gia bỏ phiếu (chống bỏ 2 lần), nội dung lá phiếu được bảo mật ẩn danh tuyệt đối.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#166534] inline-flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Bỏ phiếu kín (Không ký tên)
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-[#8E1018] absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={voterSearch}
                    onChange={(e) => setVoterSearch(e.target.value)}
                    placeholder="Gõ nhanh họ tên của đồng chí để tìm..."
                    className="w-full pl-9 pr-3 py-2 border border-[#b8424a] bg-white text-[15px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {filteredVoters.map((voter) => {
                    const alreadyVoted = votedVoterIds.has(voter.id);
                    return (
                      <button
                        key={voter.id}
                        type="button"
                        disabled={alreadyVoted}
                        onClick={() => {
                          setSelectedVoter(voter);
                          setChoices({});
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`p-3 border text-left transition-colors ${
                          alreadyVoted
                            ? 'bg-[#f3f1ec] border-[#d7c6c7] text-[#8a7577] cursor-not-allowed'
                            : 'bg-white border-[#b8424a] hover:bg-[#FBF0C9] hover:border-[#8E1018]'
                        }`}
                      >
                        <div className="font-bold text-[15px] text-[#261617] flex items-center justify-between gap-2">
                          <span className="truncate">{voter.name}</span>
                          {alreadyVoted && (
                            <span className="text-[11px] font-bold text-[#166534] shrink-0">
                              ✓ Đã bỏ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#665052] mt-0.5 truncate">
                          {[voter.code, voter.branch, voter.position]
                            .filter(Boolean)
                            .join(' · ') || 'Cử tri hợp lệ'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : activeSession ? (
          /* STEP 3: AUTHENTIC MẪU 4 / MẪU 5 PAPER BALLOT VIEW */
          <div className="space-y-4">
            {/* Voter Strip & 20% HTXSNV Live Reminder */}
            <div className="bg-[#FDF6DE] border border-[#b8424a] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                Đang bỏ phiếu với tư cách cử tri:{' '}
                <strong className="text-[#8E1018]">{selectedVoter.name}</strong>
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                <span className="tabular-nums">
                  Đã đánh dấu:{' '}
                  <strong>
                    {filledCount}/{totalCandidates}
                  </strong>{' '}
                  dòng
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedVoter(null);
                  setChoices({});
                }}
                className="text-xs font-bold text-[#8E1018] underline hover:text-[#6b0b12]"
              >
                Chọn lại tên khác
              </button>
            </div>

            {activeSession.htxsnvMode !== 'off' && totalCandidates >= 2 && (
              <div
                className={`px-4 py-2.5 border text-[14.5px] flex flex-wrap items-center justify-between gap-2 ${
                  exceedsHtxsnv
                    ? 'bg-[#FDF1F2] border-2 border-[#8E1018] text-[#8E1018] font-bold'
                    : 'bg-[#FCF8E8] border-[#D4A73E] text-[#4b3512]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {ubktIndependent ? (
                      <>
                        Quy định chọn Chi bộ xuất sắc nhất (nhóm{' '}
                        {branchCandidates.length} Chi bộ): đang chọn{' '}
                        <strong className="tabular-nums">
                          {branchHtxsnvCount} / 1
                        </strong>{' '}
                        Chi bộ mức HTXSNV ·{' '}
                        <strong>UBKT Đảng uỷ được đánh giá độc lập</strong>.
                      </>
                    ) : isMultiBranch ? (
                      <>
                        Quy định chọn Chi bộ Hoàn thành xuất sắc nhiệm vụ: đang chọn{' '}
                        <strong className="tabular-nums">
                          {activeTrackedCount} / {maxHtxsnvAllowed}
                        </strong>{' '}
                        tập thể (tối đa {maxHtxsnvAllowed}/{totalCandidates}).
                      </>
                    ) : (
                      <>
                        Tỷ lệ Hoàn thành xuất sắc nhiệm vụ (HTXSNV): đang chọn{' '}
                        <strong className="tabular-nums">
                          {activeTrackedCount} / {maxHtxsnvAllowed}
                        </strong>{' '}
                        (tối đa {activeSession.maxHtxsnvPercent}% trên{' '}
                        {totalCandidates} đối tượng).
                      </>
                    )}
                    {exceedsHtxsnv &&
                      (activeSession.htxsnvMode === 'strict'
                        ? ' Vui lòng bỏ bớt trước khi gửi phiếu.'
                        : ' (Lưu ý: số lượng chọn HTXSNV đang vượt mức khuyến nghị).')}
                  </span>
                </div>
              </div>
            )}

            {/* Official Paper-Style Mẫu 4 / Mẫu 5 Sheet */}
            <div className="bg-white border-2 border-[#8E1018] p-4 sm:p-8 shadow-md">
              <div className="flex justify-end mb-1">
                <span className="border border-[#261617] px-3 py-0.5 italic text-sm">
                  {activeSession.template === 'mau4' ? 'Mẫu 4' : 'Mẫu 5'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center mb-5">
                <div>
                  <div className="text-sm uppercase">
                    ĐẢNG UỶ TRƯỜNG THPT THANH HOÀ
                  </div>
                  <div className="text-[15px] font-bold uppercase">
                    {activeSession.unitName.toUpperCase()}
                  </div>
                  <div className="font-bold leading-none">*</div>
                </div>
                <div>
                  <div className="text-[15px] font-bold uppercase underline underline-offset-4">
                    ĐẢNG CỘNG SẢN VIỆT NAM
                  </div>
                  <div className="text-sm italic mt-1">
                    {formatDateLineVN(activeSession.meetingDate)}
                  </div>
                </div>
              </div>

              <div className="text-center mb-5">
                <h2 className="text-xl font-bold uppercase text-[#8E1018] m-0">
                  PHIẾU BIỂU QUYẾT
                </h2>
                <div className="text-[16px] font-bold text-[#261617] mt-0.5">
                  {activeSession.template === 'mau4'
                    ? 'Đánh giá, xếp loại tổ chức đảng, tập thể lãnh đạo, quản lý'
                    : 'Đánh giá, xếp loại đảng viên và cán bộ lãnh đạo, quản lý'}
                </div>
                <div className="text-sm text-[#5c4748] mt-1">
                  Bấm tích chọn <strong>01 mức xếp loại</strong> cho từng dòng trong bảng dưới đây
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="party-table text-[15px]">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="w-12 text-center">
                        STT
                      </th>
                      <th rowSpan={2} className="min-w-[200px]">
                        {activeSession.template === 'mau4'
                          ? 'Tên tổ chức đảng, tập thể lãnh đạo, quản lý'
                          : 'Họ và tên'}
                      </th>
                      {activeSession.template === 'mau5' && (
                        <th rowSpan={2} className="w-28 text-center">
                          Chức vụ
                        </th>
                      )}
                      <th rowSpan={2} className="w-28 text-center">
                        {activeSession.template === 'mau4'
                          ? 'Tự nhận mức xếp loại'
                          : 'Tự nhận mức'}
                      </th>
                      <th colSpan={4} className="text-center">
                        Kết quả biểu quyết (Chọn 1 mức)
                      </th>
                    </tr>
                    <tr>
                      {SHORT_RATING_OPTIONS.map((opt) => (
                        <th
                          key={opt.code}
                          className="w-32 text-center text-[13.5px]"
                        >
                          {opt.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSession.candidates.map((cand, idx) => {
                      const picked = choices[cand.id];
                      return (
                        <tr
                          key={cand.id}
                          className={!picked ? 'bg-[#FFFDF9]' : ''}
                        >
                          <td className="text-center tabular-nums font-bold">
                            {idx + 1}.
                          </td>
                          <td className="font-bold text-[#261617]">
                            <span>{cand.name}</span>
                            {ubktIndependent && cand.group === 'ubkt' && (
                              <span className="ml-2 text-xs font-normal italic text-[#6b0b12]">
                                (Đánh giá độc lập)
                              </span>
                            )}
                          </td>
                          {activeSession.template === 'mau5' && (
                            <td className="text-center text-[14px]">
                              {cand.position || 'ĐV'}
                            </td>
                          )}
                          <td className="text-center font-bold text-[#6b0b12]">
                            {cand.selfRatingShort || '—'}
                          </td>
                          {SHORT_RATING_OPTIONS.map((opt) => {
                            const checked = picked === opt.code;
                            return (
                              <td
                                key={opt.code}
                                onClick={() =>
                                  handleSelectChoice(cand.id, opt.code)
                                }
                                className={`text-center cursor-pointer select-none transition-colors ${
                                  checked
                                    ? 'bg-[#FDF0C2]'
                                    : 'hover:bg-[#FAF6E8]'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`ballot_${cand.id}`}
                                  checked={checked}
                                  onChange={() =>
                                    handleSelectChoice(cand.id, opt.code)
                                  }
                                  aria-label={`${cand.name} - ${opt.label}`}
                                  className="w-5 h-5 accent-[#8E1018] cursor-pointer"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm italic text-[#5c4748]">
                  <strong>(Không ký tên)</strong> · Lá phiếu được tách riêng hoàn toàn khỏi danh tính người bầu.
                </div>
                <button
                  type="button"
                  onClick={handleRequestSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#8E1018] text-white text-base font-bold hover:bg-[#730B12] disabled:opacity-50"
                >
                  <Send className="w-5 h-5 text-[#F6CF62]" />
                  Gửi phiếu kín ({filledCount}/{totalCandidates})
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Final Confirmation Modal */}
      {showConfirmModal && activeSession && selectedVoter && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận gửi phiếu kín"
        >
          <div className="bg-white border-2 border-[#8E1018] max-w-md w-full shadow-xl">
            <div className="bg-[#8E1018] text-white px-5 py-3 font-bold text-lg border-b-2 border-[#F6CF62] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#F6CF62]" />
              <span>Xác nhận bỏ phiếu kín</span>
            </div>
            <div className="p-5 space-y-2.5 text-[15px] text-[#2b1416]">
              <p className="m-0">
                Cử tri: <strong>{selectedVoter.name}</strong>
              </p>
              <p className="m-0">
                Đồng chí đã đánh dấu đầy đủ{' '}
                <strong>
                  {filledCount}/{totalCandidates}
                </strong>{' '}
                mục (trong đó có{' '}
                <strong>{htxsnvSelectedCount}</strong> mức Hoàn thành xuất sắc nhiệm vụ).
              </p>
              <p className="m-0 text-sm text-[#8E1018] font-bold">
                Lưu ý: Sau khi bấm xác nhận, lá phiếu sẽ được bỏ ẩn danh vào hòm phiếu kín và không thể chỉnh sửa hoặc bỏ lại.
              </p>
            </div>
            <div className="px-5 py-3 bg-[#FBF7EC] border-t border-[#d5969a] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                Xem lại phiếu
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmCastBallot()}
                disabled={isSubmitting}
                className="px-5 py-1.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50"
              >
                {isSubmitting ? 'Đang gửi phiếu...' : 'Xác nhận bỏ phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="py-3 px-4 text-center text-xs text-[#5c4748] border-t border-[#e3c8c9] bg-white">
        Đảng bộ Trường THPT Thanh Hoà · Hệ thống Bỏ phiếu kín trực tuyến (Mẫu 4 &amp; Mẫu 5)
      </footer>
    </div>
  );
};
