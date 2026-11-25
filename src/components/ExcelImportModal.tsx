import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { buildIndividualDossier } from '../data/seedData';
import {
  ParsedExcelRow,
  downloadIndividualExcelTemplate,
  parseIndividualExcelFile,
} from '../services/excelService';
import { Dossier, UNIT_KEY_MAP } from '../types';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDossiers: Dossier[];
  onCommitImport: (dossiersToSave: Dossier[], summaryText: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  existingDossiers,
  onCommitImport,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<ParsedExcelRow[]>([]);
  const [fatalError, setFatalError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const counts = useMemo(() => {
    let create = 0;
    let update = 0;
    let error = 0;
    for (const r of rawRows) {
      if (r.action === 'create') create++;
      else if (r.action === 'update') update++;
      else error++;
    }
    return { total: rawRows.length, create, update, error };
  }, [rawRows]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['xlsx', 'xls'].includes(ext)) {
      setFatalError(
        'Tệp không hợp lệ. Vui lòng chọn tệp Excel định dạng .xlsx hoặc .xls.'
      );
      setRawRows([]);
      setSelectedFileName(file.name);
      onNotify(
        'error',
        'Tệp không hợp lệ. Vui lòng chọn tệp Excel (.xlsx hoặc .xls).'
      );
      e.target.value = '';
      return;
    }

    setIsProcessing(true);
    setFatalError('');
    setSelectedFileName(file.name);

    const result = await parseIndividualExcelFile(file, existingDossiers);
    setIsProcessing(false);

    if (result.fatalError) {
      setFatalError(result.fatalError);
      setRawRows([]);
      onNotify('error', result.fatalError);
    } else {
      setRawRows(result.rows);
    }

    e.target.value = '';
  };

  const handleConfirmSave = async () => {
    const validRows = rawRows.filter((r) => r.action !== 'error');
    if (validRows.length === 0) {
      onNotify('error', 'Không có dòng dữ liệu hợp lệ nào để lưu.');
      return;
    }

    setIsProcessing(true);
    const now = new Date().toISOString();
    const existingById = new Map(existingDossiers.map((d) => [d.id, d]));
    const toSave: Dossier[] = [];

    for (const row of validRows) {
      if (!row.branch || row.year === null) continue;

      if (row.action === 'update' && row.existingDossierId) {
        const existing = existingById.get(row.existingDossierId);
        if (existing) {
          toSave.push({
            ...existing,
            fullName: row.fullName || existing.fullName,
            branch: row.branch,
            unitKey: UNIT_KEY_MAP[row.branch],
            positionGroup: row.positionGroup || existing.positionGroup,
            updatedAt: now,
            history: [
              ...existing.history.slice(-140),
              {
                id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                timestamp: now,
                role: 'Admin Đảng uỷ (Nguyễn Tiến Dương)',
                action: 'Cập nhật từ tệp Excel',
                note: `Cập nhật thông tin hồ sơ từ tệp ${selectedFileName}`,
              },
            ],
          });
        }
      } else {
        const created = buildIndividualDossier({
          code: row.code,
          branch: row.branch,
          year: row.year,
          fullName: row.fullName,
          positionGroup: row.positionGroup,
        });
        created.history.push({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now,
          role: 'Admin Đảng uỷ (Nguyễn Tiến Dương)',
          action: 'Nhập mới từ tệp Excel',
          toStatus: 'Chưa nộp',
          note: `Khởi tạo hồ sơ mới từ tệp ${selectedFileName}`,
        });
        toSave.push(created);
      }
    }

    await onCommitImport(
      toSave,
      `Đã lưu ${toSave.length} hồ sơ lên cơ sở dữ liệu trực tuyến (${counts.create} thêm mới, ${counts.update} cập nhật).`
    );

    setIsProcessing(false);
    setRawRows([]);
    setSelectedFileName('');
    setFatalError('');
    onClose();
  };

  const handleClose = () => {
    setRawRows([]);
    setSelectedFileName('');
    setFatalError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nhập danh sách hồ sơ cá nhân từ Excel"
    >
      <div className="bg-white border-2 border-[#8E1018] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="bg-[#8E1018] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#F6CF62]">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#F6CF62]" />
            <h3 className="text-xl font-bold m-0">
              Nhập danh sách đảng viên từ Excel (Cập nhật trực tuyến)
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-white hover:bg-[#730B12]"
            aria-label="Đóng hộp thoại nhập Excel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <div className="bg-[#FCF8E8] border border-[#D4A73E] p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-[15px] text-[#3a2416] space-y-1">
              <p className="m-0 font-bold text-[#6b0b12]">
                Các cột bắt buộc: Mã hồ sơ, Họ và tên, Chi bộ, Nhóm chức vụ, Năm
              </p>
              <p className="m-0">
                Khi cập nhật Họ và tên từ Excel, danh sách chọn tên tại <strong>Cổng Đảng viên</strong> sẽ tự động hiển thị đúng tên thật của từng đồng chí.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                downloadIndividualExcelTemplate();
                onNotify(
                  'info',
                  'Đã tải tệp Excel mẫu (Mau_nhap_ho_so_ca_nhan_2026.xlsx).'
                );
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#fdf2cc] whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Tải tệp Excel mẫu
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-60 whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              Chọn tệp Excel (.xlsx, .xls)
            </button>
            {selectedFileName && (
              <span className="text-[15px] text-[#3a2a2b]">
                Tệp đã chọn: <strong>{selectedFileName}</strong>
              </span>
            )}
          </div>

          {fatalError && (
            <div className="p-3.5 bg-[#FDF1F2] border border-[#8E1018] text-[#8E1018] flex items-start gap-2.5 text-[15px]">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{fatalError}</span>
            </div>
          )}

          {rawRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-[15px] border-b border-[#d5969a] pb-2.5 tabular-nums">
                <span>
                  Tổng số dòng: <strong>{counts.total}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-[#166534]">
                  Thêm mới: <strong>{counts.create}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-[#92400E]">
                  Cập nhật hồ sơ đã có: <strong>{counts.update}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-[#8E1018]">
                  Dòng lỗi: <strong>{counts.error}</strong>
                </span>
              </div>

              <div className="overflow-x-auto border border-[#b8424a]">
                <table className="party-table text-[14px]">
                  <thead>
                    <tr>
                      <th className="w-16 text-center">Dòng</th>
                      <th>Mã hồ sơ</th>
                      <th>Họ và tên</th>
                      <th>Chi bộ</th>
                      <th>Nhóm chức vụ</th>
                      <th className="w-16 text-center">Năm</th>
                      <th>Kết quả kiểm tra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}_${row.code}`}
                        className={
                          row.action === 'error' ? 'bg-[#FDF1F2]' : undefined
                        }
                      >
                        <td className="text-center tabular-nums">
                          {row.rowNumber}
                        </td>
                        <td className="font-bold">{row.code || '—'}</td>
                        <td>
                          {row.fullName || (
                            <em className="text-[#6b5b5c]">(Trống)</em>
                          )}
                        </td>
                        <td>{row.branch || '—'}</td>
                        <td>{row.positionGroup || 'Chưa chọn'}</td>
                        <td className="text-center tabular-nums">
                          {row.year ?? '—'}
                        </td>
                        <td>
                          {row.action === 'create' && (
                            <span className="text-[#166534] font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              Hợp lệ – Thêm mới
                            </span>
                          )}
                          {row.action === 'update' && (
                            <span className="text-[#92400E] font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              Hợp lệ – Cập nhật hồ sơ đã có
                            </span>
                          )}
                          {row.action === 'error' && (
                            <div className="text-[#8E1018] font-semibold">
                              Lỗi: {row.errors.join('; ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#FBF7EC] border-t border-[#d5969a] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#5b4748] m-0">
            Dữ liệu hợp lệ sẽ được lưu và đồng bộ ngay tới mọi thiết bị.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#fdf2cc]"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmSave()}
              disabled={isProcessing || counts.create + counts.update === 0}
              className="px-5 py-2 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50"
            >
              Lưu dữ liệu hợp lệ ({counts.create + counts.update})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
