import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Search, Users } from 'lucide-react';
import { downloadIndividualExcelTemplate } from '../services/excelService';
import {
  BRANCH_LIST,
  BranchUnitName,
  Dossier,
  DossierStatus,
  POSITION_GROUPS,
  STATUS_LIST,
  countDossierAttachments,
  getDossierDisplayName,
  getIndividualChecklistSummary,
} from '../types';
import { ExcelImportModal } from './ExcelImportModal';
import { StatusText } from './StatusText';

interface IndividualListPageProps {
  dossiers: Dossier[];
  availableYears: number[];
  selectedYear: number | 'all';
  onChangeYear: (year: number | 'all') => void;
  scopedBranch: BranchUnitName | null;
  canImportExcel: boolean;
  onOpenDossier: (dossierId: string) => void;
  onCommitExcelImport: (
    dossiersToSave: Dossier[],
    summaryText: string
  ) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const IndividualListPage: React.FC<IndividualListPageProps> = ({
  dossiers,
  availableYears,
  selectedYear,
  onChangeYear,
  scopedBranch,
  canImportExcel,
  onOpenDossier,
  onCommitExcelImport,
  onNotify,
}) => {
  const [keyword, setKeyword] = useState('');
  const [branchFilter, setBranchFilter] = useState<BranchUnitName | 'all'>(
    'all'
  );
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'all'>('all');
  const [isImportOpen, setIsImportOpen] = useState(false);

  const effectiveBranchFilter: BranchUnitName | 'all' =
    scopedBranch ?? branchFilter;

  const filteredIndividuals = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (d.type !== 'individual') return false;
      if (selectedYear !== 'all' && d.year !== selectedYear) return false;
      if (
        effectiveBranchFilter !== 'all' &&
        d.branch !== effectiveBranchFilter
      ) {
        return false;
      }
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (positionFilter === 'unselected' && d.positionGroup !== '') {
        return false;
      }
      if (
        positionFilter !== 'all' &&
        positionFilter !== 'unselected' &&
        d.positionGroup !== positionFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${d.code} ${d.fullName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    dossiers,
    selectedYear,
    effectiveBranchFilter,
    positionFilter,
    statusFilter,
    keyword,
  ]);

  const handleResetFilters = () => {
    setKeyword('');
    setBranchFilter('all');
    setPositionFilter('all');
    setStatusFilter('all');
    onChangeYear(2026);
  };

  return (
    <div className="space-y-5">
      {/* Header & Excel action buttons */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b-2 border-[#8E1018]">
        <div>
          <h2 className="text-2xl font-bold text-[#8E1018] m-0">
            {scopedBranch
              ? `Hồ sơ kiểm điểm cá nhân — ${scopedBranch}`
              : 'Hồ sơ kiểm điểm cá nhân (40 đảng viên)'}
          </h2>
          <p className="text-[15px] text-[#594446] mt-1 mb-0">
            Theo dõi chi tiết 4 mục tài liệu (Mẫu 02A/02B, Phụ lục 9/10, Phiếu BSLL Mẫu 3, Quy định nơi cư trú 221) và phê duyệt xếp loại
          </p>
        </div>

        {canImportExcel && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                downloadIndividualExcelTemplate();
                onNotify(
                  'info',
                  'Đã tải tệp Excel mẫu (Mau_nhap_ho_so_ca_nhan_2026.xlsx).'
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9] whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Tải tệp Excel mẫu
            </button>
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F6CF62]" />
              Nhập từ Excel
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#b8424a] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Tìm họ tên hoặc mã hồ sơ
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-[#8E1018] absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="VD: CB1-01 hoặc họ tên..."
              className="w-full pl-8 pr-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Năm
          </label>
          <select
            value={selectedYear === 'all' ? 'all' : String(selectedYear)}
            onChange={(e) =>
              onChangeYear(
                e.target.value === 'all' ? 'all' : Number(e.target.value)
              )
            }
            className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
          >
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
            <option value="all">Tất cả năm</option>
          </select>
        </div>

        {!scopedBranch && (
          <div>
            <label className="block text-sm font-bold text-[#6b0b12] mb-1">
              Chi bộ
            </label>
            <select
              value={branchFilter}
              onChange={(e) =>
                setBranchFilter(e.target.value as BranchUnitName | 'all')
              }
              className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
            >
              <option value="all">Tất cả chi bộ</option>
              {BRANCH_LIST.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Nhóm chức vụ
          </label>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
          >
            <option value="all">Tất cả nhóm chức vụ</option>
            <option value="unselected">Chưa chọn</option>
            {POSITION_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Trạng thái
          </label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as DossierStatus | 'all')
            }
            className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
          >
            <option value="all">Tất cả trạng thái</option>
            {STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-[15px] text-[#4d3a3b] tabular-nums">
        <span>
          Hiển thị <strong>{filteredIndividuals.length}</strong> hồ sơ cá nhân
        </span>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#b8424a] p-4">
        {filteredIndividuals.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <Users className="w-10 h-10 text-[#b8424a] mx-auto" />
            <p className="text-[16px] font-bold text-[#6b0b12] m-0">
              Bộ lọc hiện tại không có hồ sơ cá nhân nào phù hợp.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-1.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12]"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="party-table text-[14px]">
              <thead>
                <tr>
                  <th className="w-12 text-center">STT</th>
                  <th className="w-24">Mã hồ sơ</th>
                  <th className="min-w-[155px]">Họ và tên</th>
                  <th className="w-24">Chi bộ</th>
                  <th className="min-w-[180px]">Nhóm chức vụ</th>
                  <th className="w-32">Trạng thái</th>
                  <th className="min-w-[185px]">Tình trạng tệp bắt buộc</th>
                  <th className="min-w-[160px]">Mức chính thức</th>
                  <th className="w-28 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredIndividuals.map((item, idx) => {
                  const summary = getIndividualChecklistSummary(item);
                  const totalFiles = countDossierAttachments(item);
                  const isComplete =
                    summary.requiredTotal > 0 &&
                    summary.requiredCompleted === summary.requiredTotal;

                  return (
                    <tr key={item.id}>
                      <td className="text-center tabular-nums">{idx + 1}</td>
                      <td className="font-bold text-[#6b0b12]">{item.code}</td>
                      <td className="font-semibold text-[#2b1416]">
                        {getDossierDisplayName(item)}
                      </td>
                      <td>{item.branch}</td>
                      <td>
                        {item.positionGroup || (
                          <span className="italic text-[#7a6869]">
                            Chưa chọn
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusText status={item.status} />
                      </td>
                      <td>
                        <div className="tabular-nums font-bold">
                          <span
                            className={
                              isComplete ? 'text-[#166534]' : 'text-[#8E1018]'
                            }
                          >
                            {summary.requiredCompleted}/{summary.requiredTotal}{' '}
                            mục
                          </span>{' '}
                          <span className="font-normal text-xs text-[#665052]">
                            ({totalFiles} tệp)
                          </span>
                        </div>
                        {summary.missingShortLabels.length > 0 && (
                          <div className="text-xs text-[#665052] leading-snug mt-0.5">
                            Thiếu: {summary.missingShortLabels.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="font-bold text-[#166534]">
                        {item.officialRating || (
                          <span className="italic font-normal text-[#7a6869]">
                            Chưa có kết quả
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => onOpenDossier(item.id)}
                          className="px-3 py-1 bg-[#8E1018] text-white text-sm font-bold hover:bg-[#730B12] whitespace-nowrap"
                        >
                          Mở chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canImportExcel && (
        <ExcelImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          existingDossiers={dossiers}
          onCommitImport={onCommitExcelImport}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
