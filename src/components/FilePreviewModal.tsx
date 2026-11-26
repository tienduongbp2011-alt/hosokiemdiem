import React, { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { StoredFileRecord, formatDateTimeVN, formatFileSize } from '../types';

interface FilePreviewModalProps {
  fileRecord: StoredFileRecord | null;
  onClose: () => void;
  onDownload: (record: StoredFileRecord) => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  fileRecord,
  onClose,
  onDownload,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileRecord) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(fileRecord.blob);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [fileRecord]);

  if (!fileRecord) return null;

  const ext = fileRecord.extension.toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Xem trước tệp đính kèm"
    >
      <div className="bg-white border-2 border-[#8E1018] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="bg-[#8E1018] text-white px-5 py-3 flex items-center justify-between gap-4 border-b-2 border-[#F6CF62]">
          <div className="min-w-0">
            <h3 className="text-lg font-bold truncate m-0">
              {fileRecord.name}
            </h3>
            <p className="text-sm text-[#F6CF62] m-0">
              {formatFileSize(fileRecord.size)} · Tải lên lúc{' '}
              {formatDateTimeVN(fileRecord.uploadedAt)} (
              {fileRecord.uploadedByLabel})
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onDownload(fileRecord)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F6CF62] text-[#8E1018] font-bold text-sm hover:bg-[#f2c444] whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Tải xuống
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white hover:bg-[#730B12]"
              aria-label="Đóng xem trước"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#F7F4EC] p-4 flex items-center justify-center min-h-[360px]">
          {isImage && objectUrl && (
            <img
              src={objectUrl}
              alt={fileRecord.name}
              className="max-w-full max-h-[70vh] object-contain border border-[#d5969a] bg-white"
            />
          )}

          {isPdf && objectUrl && (
            <iframe
              src={objectUrl}
              title={fileRecord.name}
              className="w-full h-[70vh] bg-white border border-[#d5969a]"
            />
          )}

          {!isImage && !isPdf && (
            <div className="bg-white border border-[#d5969a] p-8 max-w-lg text-center">
              <FileText className="w-12 h-12 text-[#8E1018] mx-auto mb-3" />
              <p className="text-lg font-bold text-[#6b0b12] mb-2">
                Tệp định dạng .{ext.toUpperCase()} không hiển thị trực tiếp trong trình duyệt
              </p>
              <p className="text-[15px] text-[#4a3435] mb-5">
                Tệp đã được lưu trực tuyến trên Supabase Storage. Vui lòng tải xuống để mở bằng Microsoft Word hoặc Excel.
              </p>
              <button
                type="button"
                onClick={() => onDownload(fileRecord)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12]"
              >
                <Download className="w-4 h-4" />
                Tải xuống tệp ({formatFileSize(fileRecord.size)})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
