import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { exportSummaryToExcel } from '../services/excelService';
import {
  ALL_UNITS,
  BranchUnitName,
  Dossier,
  DossierStatus,
  DossierType,
  RATING_OPTIONS,
  STATUS_LIST,
  UnitName,
  formatDateVN,
  getDossierDisplayName,
  getIndividualChecklistSummary,
} from '../types';
import { StatusText } from './StatusText';

interface SummaryExportPageProps {
  dossiers: Dossier[];
  availableYears: number[];
  selectedYear: number | 'all';
  onChangeYear: (year: number | 'all') => void;
  scopedBranch: BranchUnitName | null;
  onOpenDossier: (dossierId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const SummaryExportPage: React.FC<SummaryExportPageProps> = ({
  dossiers,
  availableYears,
  selectedYear,
  onChangeYear,
  scopedBranch,
  onOpenDossier,
  onNotify,
}) => {
  const [unitFilter, setUnitFilter] = useState<UnitName | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<DossierType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'all'>('all');
  const [previewTab, setPreviewTab] = useState<'list' | 'revision'>('list');

  const effectiveUnitFilter: UnitName | 'all' = scopedBranch ?? unitFilter;

  const filteredDossiers = useMemo(() => {
    return dossiers.filter((d) => {
      if (selectedYear !== 'all' && d.year !== selectedYear) return false;
      if (effectiveUnitFilter !== 'all' && d.branch !== effectiveUnitFilter) {
        return false;
      }
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      return true;
    });
  }, [dossiers, selectedYear, effectiveUnitFilter, typeFilter, statusFilter]);

  const activeUnits = useMemo<UnitName[]>(() => {
    return effectiveUnitFilter === 'all' ? ALL_UNITS : [effectiveUnitFilter];
  }, [effectiveUnitFilter]);

  // Tính kết quả tổng hợp CHỈ từ trường Mức xếp loại chính thức
  const ratingSummaryRows = useMemo(() => {
    return activeUnits.map((unit) => {
      const items = filteredDossiers.filter((d) => d.branch === unit);
      return {
        unit,
        total: items.length,
        htxs: items.filter((d) => d.officialRating === RATING_OPTIONS[0]).length,
        htt: items.filter((d) => d.officialRating === RATING_OPTIONS[1]).length,
        ht: items.filter((d) => d.officialRating === RATING_OPTIONS[2]).length,
        kht: items.filter((d) => d.officialRating === RATING_OPTIONS[3]).length,
        noOfficial: items.filter((d) => !d.officialRating).length,
      };
    });
  }, [activeUnits, filteredDossiers]);

  const summaryTotals = useMemo(() => {
    return ratingSummaryRows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        htxs: acc.htxs + r.htxs,
        htt: acc.htt + r.htt,
        ht: acc.ht + r.ht,
        kht: acc.kht + r.kht,
        noOfficial: acc.noOfficial + r.noOfficial,
      }),
      { total: 0, htxs: 0, htt: 0, ht: 0, kht: 0, noOfficial: 0 }
    );
  }, [ratingSummaryRows]);

  const revisionDossiers = useMemo(
    () => filteredDossiers.filter((d) => d.status === 'Cần bổ sung'),
    [filteredDossiers]
  );

  const handleExportExcel = () => {
    try {
      const fileName = exportSummaryToExcel(filteredDossiers, {
        year: selectedYear,
        branch: effectiveUnitFilter,
        type: typeFilter,
        status: statusFilter,
      });
      onNotify(
        'success',
        `Đã xuất tệp Excel báo cáo thành công: ${fileName} (gồm 3 trang tính).`
      );
    } catch {
      onNotify('error', 'Không thể tạo tệp Excel. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Export CTA */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b-2 border-[#8E1018]">
        <div>
          <h2 className="text-2xl font-bold text-[#8E1018] m-0">
            Tổng hợp kết quả và xuất Excel
          </h2>
          <p className="text-[15px] text-[#594446] mt-1 mb-0">
            Bảng tổng hợp chỉ tính theo Mức xếp loại chính thức; tệp Excel 3 trang tính kèm tình trạng Mẫu 02A/02B, PL9/10, Mẫu 3 và Quy định 221
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] border border-[#6b0b12] whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4 text-[#F6CF62]" />
          Xuất Excel (.xlsx)
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#b8424a] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Năm báo cáo
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
              Đơn vị / Chi bộ
            </label>
            <select
              value={unitFilter}
              onChange={(e) =>
                setUnitFilter(e.target.value as UnitName | 'all')
              }
              className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
            >
              <option value="all">Tất cả đơn vị (6)</option>
              {ALL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Loại hồ sơ
          </label>
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as DossierType | 'all')
            }
            className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
          >
            <option value="all">Tất cả loại hồ sơ</option>
            <option value="collective">Hồ sơ tập thể</option>
            <option value="individual">Hồ sơ cá nhân</option>
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

      {/* Sheet 1 Preview */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-[#8E1018] m-0 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            <span>Trang tính 1: Tổng hợp xếp loại chính thức theo đơn vị</span>
          </h3>
          <span className="text-sm text-[#5c4748]">
            Chỉ tính từ trường “Mức xếp loại chính thức”
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="party-table text-[15px]">
            <thead>
              <tr>
                <th className="min-w-[165px]">Đơn vị / Chi bộ</th>
                <th className="text-right w-24">Tổng hồ sơ</th>
                <th className="text-right min-w-[140px]">
                  Hoàn thành xuất sắc nhiệm vụ
                </th>
                <th className="text-right min-w-[130px]">
                  Hoàn thành tốt nhiệm vụ
                </th>
                <th className="text-right min-w-[120px]">
                  Hoàn thành nhiệm vụ
                </th>
                <th className="text-right min-w-[135px]">
                  Không hoàn thành nhiệm vụ
                </th>
                <th className="text-right min-w-[150px]">
                  Chưa có kết quả chính thức
                </th>
              </tr>
            </thead>
            <tbody>
              {ratingSummaryRows.map((row) => (
                <tr key={row.unit}>
                  <td className="font-bold text-[#6b0b12]">{row.unit}</td>
                  <td className="text-right tabular-nums font-bold">
                    {row.total}
                  </td>
                  <td className="text-right tabular-nums">{row.htxs}</td>
                  <td className="text-right tabular-nums">{row.htt}</td>
                  <td className="text-right tabular-nums">{row.ht}</td>
                  <td className="text-right tabular-nums">{row.kht}</td>
                  <td className="text-right tabular-nums text-[#665052]">
                    {row.noOfficial}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  {scopedBranch ? `Tổng ${scopedBranch}` : 'Tổng toàn Đảng bộ'}
                </td>
                <td className="text-right tabular-nums">
                  {summaryTotals.total}
                </td>
                <td className="text-right tabular-nums">
                  {summaryTotals.htxs}
                </td>
                <td className="text-right tabular-nums">{summaryTotals.htt}</td>
                <td className="text-right tabular-nums">{summaryTotals.ht}</td>
                <td className="text-right tabular-nums">{summaryTotals.kht}</td>
                <td className="text-right tabular-nums">
                  {summaryTotals.noOfficial}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Sheet 2 & Sheet 3 Preview Tabs */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#d5969a] pb-3">
          <button
            type="button"
            onClick={() => setPreviewTab('list')}
            className={`px-4 py-2 font-bold text-[15px] border whitespace-nowrap ${
              previewTab === 'list'
                ? 'bg-[#8E1018] text-white border-[#8E1018]'
                : 'bg-[#FBF0C9] text-[#6b0b12] border-[#b8424a] hover:bg-[#F6CF62]'
            }`}
          >
            Trang tính 2: Danh sách hồ sơ ({filteredDossiers.length})
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('revision')}
            className={`px-4 py-2 font-bold text-[15px] border whitespace-nowrap ${
              previewTab === 'revision'
                ? 'bg-[#8E1018] text-white border-[#8E1018]'
                : 'bg-[#FBF0C9] text-[#6b0b12] border-[#b8424a] hover:bg-[#F6CF62]'
            }`}
          >
            Trang tính 3: Hồ sơ cần bổ sung ({revisionDossiers.length})
          </button>
        </div>

        {previewTab === 'list' && (
          <>
            {filteredDossiers.length === 0 ? (
              <p className="text-center py-8 text-[15px] text-[#665052] m-0">
                Không có hồ sơ nào phù hợp với bộ lọc hiện tại.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="party-table text-[13px]">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">STT</th>
                      <th>Mã hồ sơ</th>
                      <th>Họ tên / Tập thể</th>
                      <th>Đơn vị</th>
                      <th>Trạng thái</th>
                      <th>2A/2B</th>
                      <th>PL9/10</th>
                      <th>Mẫu 3</th>
                      <th>QĐ 221</th>
                      <th>Mức tự đề xuất</th>
                      <th>Mức chi bộ đề nghị</th>
                      <th>Mức chính thức</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDossiers.map((item, idx) => {
                      const check =
                        item.type === 'individual'
                          ? getIndividualChecklistSummary(item)
                          : null;
                      return (
                        <tr key={item.id}>
                          <td className="text-center tabular-nums">
                            {idx + 1}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => onOpenDossier(item.id)}
                              className="font-bold text-[#8E1018] underline hover:text-[#6b0b12]"
                            >
                              {item.code}
                            </button>
                          </td>
                          <td>{getDossierDisplayName(item)}</td>
                          <td>{item.branch}</td>
                          <td>
                            <StatusText status={item.status} />
                          </td>
                          <td>{check ? check.mau02Status : '—'}</td>
                          <td>{check ? check.phuLucStatus : '—'}</td>
                          <td>{check ? check.mau3Status : '—'}</td>
                          <td>{check ? check.cuTru221Status : '—'}</td>
                          <td>
                            {item.type === 'collective'
                              ? '—'
                              : item.selfProposedRating || ''}
                          </td>
                          <td>{item.branchProposedRating || ''}</td>
                          <td className="font-bold text-[#166534]">
                            {item.officialRating || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {previewTab === 'revision' && (
          <>
            {revisionDossiers.length === 0 ? (
              <p className="text-center py-8 text-[15px] text-[#665052] m-0">
                Hiện không có hồ sơ nào đang ở trạng thái Cần bổ sung theo bộ lọc đang chọn.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="party-table text-[14px]">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">STT</th>
                      <th>Mã hồ sơ</th>
                      <th>Họ và tên / Tên tập thể</th>
                      <th>Đơn vị</th>
                      <th>Tài liệu còn thiếu</th>
                      <th>Nội dung yêu cầu</th>
                      <th className="w-28 text-center">Hạn nộp lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisionDossiers.map((item, idx) => {
                      const latest =
                        item.revisionRequests[item.revisionRequests.length - 1];
                      return (
                        <tr key={item.id}>
                          <td className="text-center tabular-nums">
                            {idx + 1}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => onOpenDossier(item.id)}
                              className="font-bold text-[#8E1018] underline hover:text-[#6b0b12]"
                            >
                              {item.code}
                            </button>
                          </td>
                          <td>{getDossierDisplayName(item)}</td>
                          <td>{item.branch}</td>
                          <td>
                            {latest ? latest.missingItems.join('; ') : '—'}
                          </td>
                          <td>{latest ? latest.details : '—'}</td>
                          <td className="text-center tabular-nums font-bold text-[#8E1018]">
                            {latest ? formatDateVN(latest.deadline) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
