import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import {
  SHORT_RATING_OPTIONS,
  SHORT_TO_RATING,
  ShortRating,
  VotingSession,
  VotingTallyResult,
} from '../types';

interface VotingPrintModalProps {
  session: VotingSession | null;
  tally: VotingTallyResult | null;
  attendanceCount: number;
  onClose: () => void;
}

function formatVietnameseDateLine(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `Thiện Hưng, ngày ${Number(day)} tháng ${Number(month)} năm ${year}`;
  }
  const now = new Date();
  return `Thiện Hưng, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
}

export function getMajorityRating(
  counts: Record<ShortRating, number> | undefined,
  totalBallots: number
): ShortRating | '' {
  if (!counts || totalBallots <= 0) return '';
  let best: ShortRating | '' = '';
  let bestVal = -1;
  for (const opt of SHORT_RATING_OPTIONS) {
    const v = counts[opt.code] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = opt.code;
    }
  }
  return bestVal > 0 ? best : '';
}

export const VotingPrintModal: React.FC<VotingPrintModalProps> = ({
  session,
  tally,
  attendanceCount,
  onClose,
}) => {
  const [mode, setMode] = useState<'minutes' | 'blank'>(
    session?.status === 'closed' ? 'minutes' : 'blank'
  );

  if (!session) return null;

  const isMau4 = session.template === 'mau4';
  const totalBallots = tally?.totalBallots ?? 0;
  const dateLine = formatVietnameseDateLine(session.meetingDate);

  const subUnitHeader =
    session.unitKey === 'dang-bo'
      ? 'BAN CHẤP HÀNH ĐẢNG BỘ'
      : session.unitKey === 'ubkt'
        ? 'UBKT ĐẢNG UỶ'
        : session.unitName.toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="In biểu mẫu và biên bản kiểm phiếu"
    >
      <div className="bg-white border-2 border-[#8E1018] w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl print-only-sheet print:max-h-none">
        {/* Toolbar (hidden on print) */}
        <div className="no-print bg-[#8E1018] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#F6CF62]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-base">
              In / Lưu PDF ({isMau4 ? 'Mẫu 4' : 'Mẫu 5'})
            </span>
            <div className="inline-flex border border-[#F6CF62]">
              {session.status === 'closed' && (
                <button
                  type="button"
                  onClick={() => setMode('minutes')}
                  className={`px-3 py-1 text-xs font-bold ${
                    mode === 'minutes'
                      ? 'bg-[#F6CF62] text-[#8E1018]'
                      : 'text-white hover:bg-[#730B12]'
                  }`}
                >
                  Biên bản tổng hợp kiểm phiếu
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode('blank')}
                className={`px-3 py-1 text-xs font-bold ${
                  mode === 'blank'
                    ? 'bg-[#F6CF62] text-[#8E1018]'
                    : 'text-white hover:bg-[#730B12]'
                }`}
              >
                Phiếu biểu quyết trống ({isMau4 ? 'Mẫu 4' : 'Mẫu 5'})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F6CF62] text-[#8E1018] font-bold text-sm hover:bg-[#f2c444]"
            >
              <Printer className="w-4 h-4" />
              In / Lưu PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white hover:bg-[#730B12]"
              aria-label="Đóng cửa sổ in"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable A4 Party Document */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white text-black leading-relaxed">
          {/* Top-right Mẫu 4 / Mẫu 5 box */}
          <div className="flex justify-end mb-2">
            <div className="border border-black px-4 py-0.5 italic text-[14px]">
              {isMau4 ? 'Mẫu 4' : 'Mẫu 5'}
            </div>
          </div>

          {/* Standard Party Header */}
          <div className="grid grid-cols-2 gap-4 items-start mb-6 text-center">
            <div>
              <div className="text-[14px] uppercase">
                ĐẢNG UỶ TRƯỜNG THPT THANH HOÀ
              </div>
              <div className="text-[15px] font-bold uppercase">
                {subUnitHeader}
              </div>
              <div className="text-[15px] font-bold leading-none mt-0.5">*</div>
            </div>
            <div>
              <div className="text-[15px] font-bold uppercase underline underline-offset-4">
                ĐẢNG CỘNG SẢN VIỆT NAM
              </div>
              <div className="text-[14px] italic mt-2">{dateLine}</div>
            </div>
          </div>

          {/* Document Title */}
          <div className="text-center mb-5">
            <h2 className="text-[18px] font-bold uppercase m-0">
              {mode === 'minutes'
                ? 'BIÊN BẢN TỔNG HỢP KẾT QUẢ BIỂU QUYẾT'
                : 'PHIẾU BIỂU QUYẾT'}
            </h2>
            <div className="text-[16px] font-bold mt-1">
              {isMau4
                ? 'Đánh giá, xếp loại tổ chức đảng, tập thể lãnh đạo, quản lý'
                : 'Đánh giá, xếp loại đảng viên và cán bộ lãnh đạo, quản lý'}
            </div>
            <div className="text-[14px] italic mt-1">
              ({session.title} — Năm {session.year})
            </div>
          </div>

          {/* Summary metadata for counting minutes */}
          {mode === 'minutes' && (
            <div className="mb-4 text-[14.5px] space-y-1">
              <p className="m-0">
                - Tổng số cử tri thuộc diện bỏ phiếu:{' '}
                <strong>{session.eligibleVoters.length}</strong> đồng chí.
              </p>
              <p className="m-0">
                - Tổng số phiếu phát ra (đã điểm danh):{' '}
                <strong>{attendanceCount}</strong> phiếu · Tổng số phiếu thu về hợp lệ:{' '}
                <strong>{totalBallots}</strong> phiếu.
              </p>
            </div>
          )}

          {/* Main Official Table (Exact Mẫu 4 & Mẫu 5 Structure) */}
          <table className="w-full border-collapse text-[14px] text-black">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="border border-black px-2 py-2 text-center w-12 font-bold"
                >
                  STT
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-3 py-2 text-center font-bold"
                >
                  {isMau4
                    ? 'Tên tổ chức đảng, tập thể lãnh đạo, quản lý'
                    : 'Họ và tên'}
                </th>
                {!isMau4 && (
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-2 text-center w-28 font-bold"
                  >
                    Chức vụ
                  </th>
                )}
                <th
                  rowSpan={2}
                  className="border border-black px-2 py-2 text-center w-28 font-bold"
                >
                  {isMau4 ? 'Tự nhận mức xếp loại' : 'Tự nhận mức'}
                </th>
                <th
                  colSpan={4}
                  className="border border-black px-2 py-1.5 text-center font-bold"
                >
                  Kết quả biểu quyết
                </th>
                {mode === 'minutes' && (
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-2 text-center w-36 font-bold"
                  >
                    Mức đạt đa số
                  </th>
                )}
              </tr>
              <tr>
                {SHORT_RATING_OPTIONS.map((opt) => (
                  <th
                    key={opt.code}
                    className="border border-black px-2 py-1.5 text-center w-28 font-bold leading-snug"
                  >
                    {opt.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {session.candidates.map((cand, idx) => {
                const counts = tally?.tallies?.[cand.id];
                const majority = getMajorityRating(counts, totalBallots);
                return (
                  <tr key={cand.id}>
                    <td className="border border-black px-2 py-2 text-center tabular-nums">
                      {idx + 1}.
                    </td>
                    <td className="border border-black px-3 py-2 font-bold">
                      {cand.name}
                    </td>
                    {!isMau4 && (
                      <td className="border border-black px-2 py-2 text-center">
                        {cand.position || 'ĐV'}
                      </td>
                    )}
                    <td className="border border-black px-2 py-2 text-center font-bold">
                      {cand.selfRatingShort || '—'}
                    </td>

                    {SHORT_RATING_OPTIONS.map((opt) => {
                      if (mode === 'blank') {
                        return (
                          <td
                            key={opt.code}
                            className="border border-black px-2 py-2 text-center"
                          >
                            &nbsp;
                          </td>
                        );
                      }
                      const n = counts?.[opt.code] ?? 0;
                      const pct =
                        totalBallots > 0
                          ? ((n / totalBallots) * 100).toFixed(1)
                          : '0.0';
                      const isWinner = majority === opt.code && n > 0;
                      return (
                        <td
                          key={opt.code}
                          className={`border border-black px-2 py-2 text-center tabular-nums ${
                            isWinner ? 'font-bold bg-[#f5f2e8]' : ''
                          }`}
                        >
                          {n}/{totalBallots}
                          <div className="text-[12px]">({pct}%)</div>
                        </td>
                      );
                    })}

                    {mode === 'minutes' && (
                      <td className="border border-black px-2 py-2 text-center font-bold text-[13px]">
                        {majority ? SHORT_TO_RATING[majority] : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer / Signatures */}
          {mode === 'blank' ? (
            <div className="mt-4 space-y-2 text-[14px]">
              <div className="text-right italic font-bold pr-8">
                (Không ký tên)
              </div>
              <p className="m-0">
                <strong className="underline italic">Ghi chú:</strong>{' '}
                {isMau4
                  ? 'Mẫu phiếu này được sử dụng để biểu quyết đánh giá, xếp loại: tổ chức đảng, tập thể lãnh đạo, quản lý các cấp.'
                  : 'Mẫu phiếu này được sử dụng để biểu quyết đánh giá, xếp loại đảng viên và cán bộ lãnh đạo, quản lý.'}
              </p>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-[14.5px]">
              <div>
                <div className="font-bold uppercase">THƯ KÝ HỘI NGHỊ</div>
                <div className="italic text-[13px]">(Ký, ghi rõ họ tên)</div>
                <div className="h-20" />
              </div>
              <div>
                <div className="font-bold uppercase">
                  TM. BAN KIỂM PHIẾU / CHỦ TRÌ
                </div>
                <div className="italic text-[13px]">(Ký, ghi rõ họ tên)</div>
                <div className="h-20" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
