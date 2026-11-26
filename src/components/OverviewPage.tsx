import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  FolderOpen,
  Users,
  X,
} from 'lucide-react';
import {
  ALL_UNITS,
  BRANCH_LIST,
  BranchUnitName,
  Dossier,
  DossierStatus,
  NavSection,
  STATUS_LIST,
  UnitName,
  countDossierAttachments,
  getDossierDisplayName,
} from '../types';
import { StatusText } from './StatusText';

interface OverviewPageProps {
  dossiers: Dossier[];
  availableYears: number[];
  selectedYear: number | 'all';
  onChangeYear: (year: number | 'all') => void;
  scopedBranch: UnitName | null;
  onNavigate: (section: NavSection) => void;
  onOpenDossier: (dossierId: string) => void;
}

interface DrilldownSelection {
  unit: UnitName;
  status: DossierStatus;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  dossiers,
  availableYears,
  selectedYear,
  onChangeYear,
  scopedBranch,
  onNavigate,
  onOpenDossier,
}) => {
  const [unitFilter, setUnitFilter] = useState<UnitName | 'all'>('all');
  const [drilldown, setDrilldown] = useState<DrilldownSelection | null>(null);

  const effectiveUnitFilter: UnitName | 'all' = scopedBranch ?? unitFilter;

  const filteredDossiers = useMemo(() => {
    return dossiers.filter((d) => {
      if (selectedYear !== 'all' && d.year !== selectedYear) return false;
      if (effectiveUnitFilter !== 'all' && d.branch !== effectiveUnitFilter) {
        return false;
      }
      return true;
    });
  }, [dossiers, selectedYear, effectiveUnitFilter]);

  const activeUnits = useMemo<UnitName[]>(() => {
    if (effectiveUnitFilter !== 'all') return [effectiveUnitFilter];
    return ALL_UNITS;
  }, [effectiveUnitFilter]);

  const kpi = useMemo(() => {
    const collectiveCount = filteredDossiers.filter(
      (d) => d.type === 'collective'
    ).length;
    const individualCount = filteredDossiers.filter(
      (d) => d.type === 'individual'
    ).length;
    const branchCount = scopedBranch
      ? 1
      : effectiveUnitFilter === 'all'
        ? BRANCH_LIST.length
        : BRANCH_LIST.includes(effectiveUnitFilter as BranchUnitName)
          ? 1
          : 0;
    return {
      branchCount,
      collectiveCount,
      individualCount,
      totalCount: filteredDossiers.length,
    };
  }, [filteredDossiers, scopedBranch, effectiveUnitFilter]);

  const progressRows = useMemo(() => {
    return activeUnits.map((unit) => {
      const items = filteredDossiers.filter((d) => d.branch === unit);
      return {
        unit,
        individual: items.filter((d) => d.type === 'individual').length,
        collective: items.filter((d) => d.type === 'collective').length,
        chuaNop: items.filter((d) => d.status === 'Chưa nộp').length,
        choChiBo: items.filter((d) => d.status === 'Chờ Chi bộ kiểm tra')
          .length,
        dangRaSoat: items.filter((d) => d.status === 'Đang rà soát').length,
        canBoSung: items.filter((d) => d.status === 'Cần bổ sung').length,
        daHoanTat: items.filter((d) => d.status === 'Đã hoàn tất').length,
      };
    });
  }, [activeUnits, filteredDossiers]);

  const totalsRow = useMemo(() => {
    return progressRows.reduce(
      (acc, row) => ({
        individual: acc.individual + row.individual,
        collective: acc.collective + row.collective,
        chuaNop: acc.chuaNop + row.chuaNop,
        choChiBo: acc.choChiBo + row.choChiBo,
        dangRaSoat: acc.dangRaSoat + row.dangRaSoat,
        canBoSung: acc.canBoSung + row.canBoSung,
        daHoanTat: acc.daHoanTat + row.daHoanTat,
      }),
      {
        individual: 0,
        collective: 0,
        chuaNop: 0,
        choChiBo: 0,
        dangRaSoat: 0,
        canBoSung: 0,
        daHoanTat: 0,
      }
    );
  }, [progressRows]);

  const drilldownDossiers = useMemo(() => {
    if (!drilldown) return [];
    return filteredDossiers.filter(
      (d) => d.branch === drilldown.unit && d.status === drilldown.status
    );
  }, [filteredDossiers, drilldown]);

  return (
    <div className="space-y-6">
      {/* Page Title & Filter Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b-2 border-[#8E1018]">
        <div>
          <h2 className="text-2xl md:text-[26px] font-bold text-[#8E1018] m-0 leading-tight">
            {scopedBranch
              ? `Tổng quan tiến độ hồ sơ — ${scopedBranch}`
              : 'Tổng quan tiến độ hồ sơ kiểm điểm cuối năm'}
          </h2>
          <p className="text-[15px] text-[#594446] mt-1 mb-0">
            {scopedBranch
              ? `Theo dõi tiến độ nộp hồ sơ tập thể và đảng viên thuộc ${scopedBranch} theo thời gian thực`
              : 'Theo dõi tổng hợp hồ sơ Đảng bộ trường, UBKT Đảng uỷ và 4 Chi bộ trực thuộc · Đồng bộ trực tuyến'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="overview-year-filter"
              className="text-[15px] font-bold text-[#6b0b12] whitespace-nowrap"
            >
              Năm:
            </label>
            <select
              id="overview-year-filter"
              value={selectedYear === 'all' ? 'all' : String(selectedYear)}
              onChange={(e) =>
                onChangeYear(
                  e.target.value === 'all' ? 'all' : Number(e.target.value)
                )
              }
              className="px-3 py-1.5 bg-white border border-[#8E1018] text-[15px] font-bold text-[#2b1416] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
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
            <div className="flex items-center gap-2">
              <label
                htmlFor="overview-branch-filter"
                className="text-[15px] font-bold text-[#6b0b12] whitespace-nowrap"
              >
                Đơn vị:
              </label>
              <select
                id="overview-branch-filter"
                value={unitFilter}
                onChange={(e) =>
                  setUnitFilter(e.target.value as UnitName | 'all')
                }
                className="px-3 py-1.5 bg-white border border-[#8E1018] text-[15px] font-bold text-[#2b1416] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
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
        </div>
      </div>

      {/* 4 KPI Stat Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#b8424a] border-t-4 border-t-[#8E1018] px-5 py-4">
          <div className="text-[15px] font-bold text-[#6b0b12]">Chi bộ</div>
          <div className="text-4xl font-bold text-[#8E1018] mt-1 tabular-nums">
            {kpi.branchCount}
          </div>
          <div className="text-xs text-[#665052] mt-1">
            {scopedBranch
              ? 'Phạm vi quản lý của Đầu mối'
              : 'Chi bộ trực thuộc Đảng bộ'}
          </div>
        </div>

        <div className="bg-white border border-[#b8424a] border-t-4 border-t-[#8E1018] px-5 py-4">
          <div className="text-[15px] font-bold text-[#6b0b12]">
            Hồ sơ tập thể
          </div>
          <div className="text-4xl font-bold text-[#8E1018] mt-1 tabular-nums">
            {kpi.collectiveCount}
          </div>
          <div className="text-xs text-[#665052] mt-1">
            {scopedBranch
              ? `Tập thể ${scopedBranch}`
              : 'Đảng bộ, 4 Chi bộ và UBKT Đảng uỷ'}
          </div>
        </div>

        <div className="bg-white border border-[#b8424a] border-t-4 border-t-[#8E1018] px-5 py-4">
          <div className="text-[15px] font-bold text-[#6b0b12]">
            Hồ sơ cá nhân
          </div>
          <div className="text-4xl font-bold text-[#8E1018] mt-1 tabular-nums">
            {kpi.individualCount}
          </div>
          <div className="text-xs text-[#665052] mt-1">
            Kiểm điểm đảng viên cuối năm
          </div>
        </div>

        <div className="bg-[#FDF8E4] border border-[#b8424a] border-t-4 border-t-[#F6CF62] px-5 py-4">
          <div className="text-[15px] font-bold text-[#6b0b12]">
            Tổng hồ sơ
          </div>
          <div className="text-4xl font-bold text-[#8E1018] mt-1 tabular-nums">
            {kpi.totalCount}
          </div>
          <div className="text-xs text-[#665052] mt-1">
            Tập thể và cá nhân theo bộ lọc
          </div>
        </div>
      </div>

      {/* Table: Tiến độ theo đơn vị / chi bộ */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-[#8E1018] m-0">
            Tiến độ theo đơn vị và chi bộ
          </h3>
          <span className="text-sm text-[#5c4748]">
            Bấm vào số liệu tại các cột trạng thái để xem danh sách hồ sơ chi tiết
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="party-table text-[15px]">
            <thead>
              <tr>
                <th className="min-w-[165px]">Đơn vị / Chi bộ</th>
                <th className="text-right w-20">Cá nhân</th>
                <th className="text-right w-20">Tập thể</th>
                <th className="text-right w-24">Chưa nộp</th>
                <th className="text-right w-32">Chờ Chi bộ KT</th>
                <th className="text-right w-28">Đang rà soát</th>
                <th className="text-right w-28">Cần bổ sung</th>
                <th className="text-right w-28">Đã hoàn tất</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.map((row) => {
                const statusCells: { status: DossierStatus; value: number }[] = [
                  { status: 'Chưa nộp', value: row.chuaNop },
                  { status: 'Chờ Chi bộ kiểm tra', value: row.choChiBo },
                  { status: 'Đang rà soát', value: row.dangRaSoat },
                  { status: 'Cần bổ sung', value: row.canBoSung },
                  { status: 'Đã hoàn tất', value: row.daHoanTat },
                ];

                return (
                  <tr key={row.unit}>
                    <td className="font-bold text-[#6b0b12]">{row.unit}</td>
                    <td className="text-right tabular-nums">{row.individual}</td>
                    <td className="text-right tabular-nums">{row.collective}</td>
                    {statusCells.map((cell) => (
                      <td
                        key={cell.status}
                        className="text-right tabular-nums"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setDrilldown({
                              unit: row.unit,
                              status: cell.status,
                            })
                          }
                          className={`inline-block min-w-[32px] px-2 py-0.5 text-right font-bold underline decoration-dotted underline-offset-4 transition-colors hover:bg-[#FBF0C9] ${
                            cell.value > 0
                              ? cell.status === 'Đã hoàn tất'
                                ? 'text-[#166534]'
                                : cell.status === 'Cần bổ sung'
                                  ? 'text-[#8E1018]'
                                  : cell.status === 'Chờ Chi bộ kiểm tra'
                                    ? 'text-[#1D4ED8]'
                                    : cell.status === 'Đang rà soát'
                                      ? 'text-[#92400E]'
                                      : 'text-[#6b0b12]'
                              : 'text-[#8c7b7c] no-underline font-normal'
                          }`}
                          title={`Xem danh sách hồ sơ ${row.unit} - ${cell.status}`}
                        >
                          {cell.value}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  {scopedBranch ? `Tổng ${scopedBranch}` : 'Tổng toàn Đảng bộ'}
                </td>
                <td className="text-right tabular-nums">
                  {totalsRow.individual}
                </td>
                <td className="text-right tabular-nums">
                  {totalsRow.collective}
                </td>
                <td className="text-right tabular-nums">{totalsRow.chuaNop}</td>
                <td className="text-right tabular-nums">{totalsRow.choChiBo}</td>
                <td className="text-right tabular-nums">
                  {totalsRow.dangRaSoat}
                </td>
                <td className="text-right tabular-nums">
                  {totalsRow.canBoSung}
                </td>
                <td className="text-right tabular-nums">
                  {totalsRow.daHoanTat}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 3 Quick Access Cards */}
      <section className="space-y-3">
        <h3 className="text-lg font-bold text-[#6b0b12] m-0">
          Truy cập nhanh phân hệ
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('collective')}
            className="text-left bg-white border border-[#b8424a] hover:border-[#8E1018] hover:bg-[#FDF9EE] p-5 transition-colors flex flex-col justify-between gap-3 group"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#8E1018]">
                <FolderOpen className="w-6 h-6" />
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="text-lg font-bold text-[#6b0b12]">
                Hồ sơ tập thể
              </div>
              <p className="text-[14px] text-[#4d3a3b] m-0 leading-relaxed">
                Quản lý hồ sơ kiểm điểm tập thể Đảng bộ, Chi bộ 1–4, UBKT Đảng uỷ và Phụ lục 7.2.
              </p>
            </div>
            <div className="text-sm font-bold text-[#8E1018] pt-2 border-t border-[#eed1d3] tabular-nums">
              Hiện có {kpi.collectiveCount} hồ sơ tập thể
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('individual')}
            className="text-left bg-white border border-[#b8424a] hover:border-[#8E1018] hover:bg-[#FDF9EE] p-5 transition-colors flex flex-col justify-between gap-3 group"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#8E1018]">
                <Users className="w-6 h-6" />
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="text-lg font-bold text-[#6b0b12]">
                Hồ sơ cá nhân
              </div>
              <p className="text-[14px] text-[#4d3a3b] m-0 leading-relaxed">
                Theo dõi đủ 4 nhóm giấy tờ (Mẫu 02A/02B, PL9/10, Phiếu BSLL Mẫu 3, Quy định 221) và rà soát từng đảng viên.
              </p>
            </div>
            <div className="text-sm font-bold text-[#8E1018] pt-2 border-t border-[#eed1d3] tabular-nums">
              Hiện có {kpi.individualCount} hồ sơ cá nhân
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('summary')}
            className="text-left bg-white border border-[#b8424a] hover:border-[#8E1018] hover:bg-[#FDF9EE] p-5 transition-colors flex flex-col justify-between gap-3 group"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#8E1018]">
                <FileSpreadsheet className="w-6 h-6" />
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="text-lg font-bold text-[#6b0b12]">
                Tổng hợp và xuất Excel
              </div>
              <p className="text-[14px] text-[#4d3a3b] m-0 leading-relaxed">
                Thống kê xếp loại chính thức và xuất báo cáo Excel 3 trang tính kèm tình trạng từng loại giấy tờ.
              </p>
            </div>
            <div className="text-sm font-bold text-[#8E1018] pt-2 border-t border-[#eed1d3]">
              Xuất tệp .xlsx chuẩn tiếng Việt
            </div>
          </button>
        </div>
      </section>

      {/* Drill-down modal */}
      {drilldown && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Danh sách hồ sơ theo đơn vị và trạng thái"
        >
          <div className="bg-white border-2 border-[#8E1018] w-full max-w-4xl max-h-[88vh] flex flex-col shadow-xl">
            <div className="bg-[#8E1018] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#F6CF62]">
              <div>
                <h3 className="text-xl font-bold m-0">
                  {drilldown.unit} — Trạng thái: {drilldown.status}
                </h3>
                <p className="text-sm text-[#F6CF62] m-0 tabular-nums">
                  Tìm thấy {drilldownDossiers.length} hồ sơ (Năm:{' '}
                  {selectedYear === 'all' ? 'Tất cả' : selectedYear})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="p-1 text-white hover:bg-[#730B12]"
                aria-label="Đóng danh sách lọc"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-2.5 bg-[#FCF8E8] border-b border-[#e3c8c9] flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-[#6b0b12]">
                Chuyển nhanh trạng thái:
              </span>
              {STATUS_LIST.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() =>
                    setDrilldown({ unit: drilldown.unit, status: st })
                  }
                  className={`px-2.5 py-1 border font-bold whitespace-nowrap ${
                    drilldown.status === st
                      ? 'bg-[#8E1018] text-white border-[#8E1018]'
                      : 'bg-white text-[#6b0b12] border-[#b8424a] hover:bg-[#FBF0C9]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {drilldownDossiers.length === 0 ? (
                <div className="text-center py-10 text-[#665052] text-[16px]">
                  Không có hồ sơ nào của <strong>{drilldown.unit}</strong> ở trạng thái{' '}
                  <strong>{drilldown.status}</strong>.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="party-table text-[15px]">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">STT</th>
                        <th>Mã hồ sơ</th>
                        <th>Họ và tên / Tên tập thể</th>
                        <th>Loại hồ sơ</th>
                        <th className="text-center">Tệp đã nộp</th>
                        <th>Trạng thái</th>
                        <th className="w-32 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownDossiers.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="text-center tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="font-bold text-[#6b0b12]">
                            {item.code}
                          </td>
                          <td>{getDossierDisplayName(item)}</td>
                          <td>
                            {item.type === 'collective'
                              ? 'Hồ sơ tập thể'
                              : 'Hồ sơ cá nhân'}
                          </td>
                          <td className="text-center tabular-nums">
                            {countDossierAttachments(item)}
                          </td>
                          <td>
                            <StatusText status={item.status} />
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setDrilldown(null);
                                onOpenDossier(item.id);
                              }}
                              className="px-3 py-1 bg-[#8E1018] text-white text-sm font-bold hover:bg-[#730B12] whitespace-nowrap"
                            >
                              Mở chi tiết
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-[#FBF7EC] border-t border-[#d5969a] flex justify-end">
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="px-4 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
