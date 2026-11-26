import React, { useMemo, useState } from 'react';
import { FolderOpen, Search } from 'lucide-react';
import {
  ALL_UNITS,
  Dossier,
  DossierStatus,
  STATUS_LIST,
  UnitName,
  countDossierAttachments,
  getDossierDisplayName,
} from '../types';
import { StatusText } from './StatusText';

interface CollectiveListPageProps {
  dossiers: Dossier[];
  availableYears: number[];
  selectedYear: number | 'all';
  onChangeYear: (year: number | 'all') => void;
  scopedBranch: UnitName | null;
  onOpenDossier: (dossierId: string) => void;
}

export const CollectiveListPage: React.FC<CollectiveListPageProps> = ({
  dossiers,
  availableYears,
  selectedYear,
  onChangeYear,
  scopedBranch,
  onOpenDossier,
}) => {
  const [unitFilter, setUnitFilter] = useState<UnitName | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'all'>('all');
  const [keyword, setKeyword] = useState('');

  const effectiveUnitFilter: UnitName | 'all' = scopedBranch ?? unitFilter;

  const collectiveDossiers = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (d.type !== 'collective') return false;
      if (selectedYear !== 'all' && d.year !== selectedYear) return false;
      if (effectiveUnitFilter !== 'all' && d.branch !== effectiveUnitFilter) {
        return false;
      }
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (q) {
        const hay = `${d.code} ${d.fullName} ${d.branch}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dossiers, selectedYear, effectiveUnitFilter, statusFilter, keyword]);

  const handleResetFilters = () => {
    setUnitFilter('all');
    setStatusFilter('all');
    setKeyword('');
    onChangeYear(2026);
  };

  return (
    <div className="space-y-5">
      <div className="pb-3 border-b-2 border-[#8E1018]">
        <h2 className="text-2xl font-bold text-[#8E1018] m-0">
          Hồ sơ kiểm điểm tập thể
        </h2>
        <p className="text-[15px] text-[#594446] mt-1 mb-0">
          {scopedBranch
            ? `Quản lý hồ sơ kiểm điểm tập thể ${scopedBranch}, Phụ lục 7.2 và tệp đính kèm`
            : 'Gồm 6 hồ sơ tập thể: Đảng bộ Trường THPT Thanh Hoà, Chi bộ 1, Chi bộ 2, Chi bộ 3, Chi bộ 4 và UBKT Đảng uỷ'}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#b8424a] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-bold text-[#6b0b12] mb-1">
            Tìm tên tập thể / mã hồ sơ
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-[#8E1018] absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Nhập tên hoặc mã..."
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
              Đơn vị
            </label>
            <select
              value={unitFilter}
              onChange={(e) =>
                setUnitFilter(e.target.value as UnitName | 'all')
              }
              className="w-full px-3 py-1.5 border border-[#b8424a] bg-white text-[15px]"
            >
              <option value="all">Tất cả 6 đơn vị tập thể</option>
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

      {/* Table */}
      <div className="bg-white border border-[#b8424a] p-4">
        {collectiveDossiers.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <FolderOpen className="w-10 h-10 text-[#b8424a] mx-auto" />
            <p className="text-[16px] font-bold text-[#6b0b12] m-0">
              Không tìm thấy hồ sơ tập thể nào phù hợp với bộ lọc hiện tại.
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
            <table className="party-table text-[15px]">
              <thead>
                <tr>
                  <th className="w-12 text-center">STT</th>
                  <th className="min-w-[220px]">Tên tập thể</th>
                  <th className="w-36">Đơn vị</th>
                  <th className="w-16 text-center">Năm</th>
                  <th className="w-36">Trạng thái</th>
                  <th className="w-28 text-center">Số tệp đã nộp</th>
                  <th className="min-w-[175px]">Mức đề nghị</th>
                  <th className="min-w-[180px]">Mức xếp loại chính thức</th>
                  <th className="w-28 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {collectiveDossiers.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="text-center tabular-nums">{idx + 1}</td>
                    <td>
                      <div className="font-bold text-[#6b0b12]">
                        {getDossierDisplayName(item)}
                      </div>
                      <div className="text-xs text-[#665052]">
                        Mã: {item.code}
                      </div>
                    </td>
                    <td>{item.branch}</td>
                    <td className="text-center tabular-nums">{item.year}</td>
                    <td>
                      <StatusText status={item.status} />
                    </td>
                    <td className="text-center tabular-nums font-bold">
                      {countDossierAttachments(item)}
                    </td>
                    <td>
                      {item.branchProposedRating || (
                        <span className="italic text-[#7a6869]">Chưa có</span>
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
                        className="px-3 py-1.5 bg-[#8E1018] text-white text-sm font-bold hover:bg-[#730B12] whitespace-nowrap"
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
    </div>
  );
};
