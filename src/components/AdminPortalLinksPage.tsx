import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  Save,
} from 'lucide-react';
import { DEFAULT_BRANCH_PASSWORDS } from '../data/seedData';
import { SUPABASE_SETUP_SQL } from '../data/supabaseSetupSql';
import {
  fetchAllBranchAccess,
  updateBranchAccessPassword,
} from '../services/supabaseService';
import { STORAGE_BUCKET } from '../supabase';
import {
  BranchAccessRecord,
  UnitKey,
  UnitName,
  formatDateTimeVN,
  getUnitSecretaryRoleLabel,
} from '../types';

interface AdminPortalLinksPageProps {
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const UNIT_ACCESS_LIST: { key: UnitKey; name: UnitName }[] = [
  { key: 'dang-bo', name: 'Đảng bộ trường' },
  { key: 'cb1', name: 'Chi bộ 1' },
  { key: 'cb2', name: 'Chi bộ 2' },
  { key: 'cb3', name: 'Chi bộ 3' },
  { key: 'cb4', name: 'Chi bộ 4' },
  { key: 'ubkt', name: 'UBKT Đảng uỷ' },
];

export const AdminPortalLinksPage: React.FC<AdminPortalLinksPageProps> = ({
  onNotify,
}) => {
  const [accessRecords, setAccessRecords] = useState<BranchAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string>('');
  const [newPasswords, setNewPasswords] = useState<Record<string, string>>({});
  const [newHints, setNewHints] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string>('');

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const portalLinks = [
    {
      id: 'member',
      title: '1. Đường link Cổng Đảng viên (Gửi nhóm Zalo toàn trường)',
      description:
        'Đảng viên bấm link trên điện thoại hoặc máy tính, chọn Chi bộ và chọn tên của mình để tải tệp hồ sơ cá nhân lên ngay (không cần mật khẩu).',
      url: `${baseUrl}?cong=dang-vien`,
    },
    {
      id: 'branch',
      title:
        '2. Đường link Cổng Đầu mối Chi bộ & Thư ký Đảng bộ, UBKT (6 đơn vị)',
      description:
        'Dành cho Thư ký Đảng bộ trường, Bí thư / Thư ký Chi bộ 1–4 và Thư ký UBKT Đảng uỷ đăng nhập nộp hồ sơ tập thể và rà soát hồ sơ chi bộ.',
      url: `${baseUrl}?cong=chi-bo`,
    },
    {
      id: 'admin',
      title: '3. Đường link Cổng Admin Đảng uỷ (Quyền cao nhất)',
      description:
        'Dành riêng cho Đảng uỷ viên phụ trách hồ sơ đăng nhập bằng tài khoản Email & Mật khẩu quản trị trên Supabase.',
      url: `${baseUrl}?cong=admin`,
    },
  ];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchAllBranchAccess();
        if (mounted) {
          setAccessRecords(list);
        }
      } catch {
        if (mounted) {
          onNotify('error', 'Không thể tải cấu hình mật khẩu chi bộ.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onNotify]);

  const handleCopy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      onNotify('success', 'Đã sao chép đường link vào bộ nhớ tạm.');
      window.setTimeout(() => setCopiedId(''), 2500);
    } catch {
      onNotify(
        'error',
        'Trình duyệt chặn tự sao chép. Vui lòng bôi đen đường link để sao chép thủ công.'
      );
    }
  };

  const handleSaveBranchPassword = async (
    unitKey: UnitKey,
    unitName: UnitName
  ) => {
    const pw = (newPasswords[unitKey] ?? '').trim();
    if (pw.length < 4) {
      onNotify(
        'error',
        'Mật khẩu đơn vị cần có ít nhất 4 ký tự để đảm bảo an toàn.'
      );
      return;
    }
    setSavingKey(unitKey);
    try {
      const hint =
        (newHints[unitKey] ?? '').trim() ||
        `Đã cập nhật ngày ${new Date().toLocaleDateString('vi-VN')}`;
      const updated = await updateBranchAccessPassword(
        unitKey,
        unitName,
        pw,
        hint
      );
      setAccessRecords((prev) => {
        const rest = prev.filter((r) => r.unitKey !== unitKey);
        return [...rest, updated].sort(
          (a, b) =>
            UNIT_ACCESS_LIST.findIndex((k) => k.key === a.unitKey) -
            UNIT_ACCESS_LIST.findIndex((k) => k.key === b.unitKey)
        );
      });
      setNewPasswords((prev) => ({ ...prev, [unitKey]: '' }));
      setNewHints((prev) => ({ ...prev, [unitKey]: '' }));
      onNotify(
        'success',
        `Đã cập nhật mật khẩu đăng nhập cho ${getUnitSecretaryRoleLabel(unitName)}.`
      );
    } catch {
      onNotify('error', `Không thể cập nhật mật khẩu cho ${unitName}.`);
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-3 border-b-2 border-[#8E1018]">
        <h2 className="text-2xl font-bold text-[#8E1018] m-0">
          Cổng đăng nhập, Link chia sẻ và Mật khẩu Chi bộ
        </h2>
        <p className="text-[15px] text-[#594446] mt-1 mb-0">
          Sao chép đường link riêng gửi cho Đảng viên, Bí thư/Thư ký Chi bộ và quản lý mật khẩu đăng nhập từng chi bộ
        </p>
      </div>

      {/* Section 1: 3 Shareable Links */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-4">
        <h3 className="text-lg font-bold text-[#6b0b12] pb-2 border-b border-[#e3b8bb] m-0 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-[#8E1018]" />
          <span>1. Đường link truy cập riêng cho 3 đối tượng</span>
        </h3>

        <div className="space-y-4">
          {portalLinks.map((item) => (
            <div
              key={item.id}
              className="border border-[#d5969a] bg-[#FAF8F3] p-4 space-y-2"
            >
              <div className="font-bold text-[16px] text-[#6b0b12]">
                {item.title}
              </div>
              <p className="text-[14px] text-[#4d3a3b] m-0">
                {item.description}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="text"
                  readOnly
                  value={item.url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 px-3 py-2 bg-white border border-[#b8424a] text-sm text-[#261617]"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy(item.id, item.url)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#8E1018] text-white font-bold text-sm hover:bg-[#730B12] whitespace-nowrap"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="w-4 h-4 text-[#F6CF62]" />
                      Đã sao chép
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-[#F6CF62]" />
                      Sao chép link
                    </>
                  )}
                </button>
                <a
                  href={item.url}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-sm hover:bg-[#FBF0C9] whitespace-nowrap no-underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  Chuyển tới cổng
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Branch Focal Point Password Manager */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-4">
        <div className="pb-2 border-b border-[#e3b8bb]">
          <h3 className="text-lg font-bold text-[#6b0b12] m-0 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#8E1018]" />
            <span>
              2. Mật khẩu Đầu mối Chi bộ &amp; Thư ký Đảng bộ, UBKT (6 đơn vị)
            </span>
          </h3>
          <p className="text-sm text-[#5c4748] mt-1 mb-0">
            Mật khẩu được mã hoá SHA-256 trên máy chủ. Mật khẩu mặc định khởi tạo:{' '}
            <strong>dangbo@2026</strong> (Thư ký Đảng bộ trường),{' '}
            <strong>cb1@2026</strong> – <strong>cb4@2026</strong> (Chi bộ 1–4),{' '}
            <strong>ubkt@2026</strong> (Thư ký UBKT Đảng uỷ).
          </p>
        </div>

        {loading ? (
          <div className="py-6 text-center text-[#8E1018] font-bold">
            Đang tải cấu hình mật khẩu các đơn vị...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="party-table text-[14px]">
              <thead>
                <tr>
                  <th className="w-44">Đơn vị / Vai trò</th>
                  <th className="min-w-[210px]">Ghi chú hiện tại</th>
                  <th className="w-40">Cập nhật lần cuối</th>
                  <th className="min-w-[200px]">Đặt mật khẩu mới</th>
                  <th className="min-w-[180px]">Ghi chú (tuỳ chọn)</th>
                  <th className="w-32 text-center">Lưu</th>
                </tr>
              </thead>
              <tbody>
                {UNIT_ACCESS_LIST.map(({ key, name }) => {
                  const rec = accessRecords.find((r) => r.unitKey === key);
                  const fallbackHint = DEFAULT_BRANCH_PASSWORDS[key].hintLabel;
                  return (
                    <tr key={key}>
                      <td>
                        <div className="font-bold text-[#6b0b12]">{name}</div>
                        <div className="text-xs text-[#665052]">
                          {getUnitSecretaryRoleLabel(name)}
                        </div>
                      </td>
                      <td>{rec?.hintLabel || fallbackHint}</td>
                      <td className="tabular-nums text-xs text-[#594446]">
                        {rec ? formatDateTimeVN(rec.updatedAt) : '—'}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={newPasswords[key] ?? ''}
                          onChange={(e) =>
                            setNewPasswords((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          placeholder="Nhập mật khẩu mới..."
                          className="w-full px-2.5 py-1.5 border border-[#b8424a] bg-white text-[14px]"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={newHints[key] ?? ''}
                          onChange={(e) =>
                            setNewHints((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          placeholder="VD: Đã cấp cho đ/c Thư ký"
                          className="w-full px-2.5 py-1.5 border border-[#d5969a] bg-white text-[14px]"
                        />
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() =>
                            void handleSaveBranchPassword(key, name)
                          }
                          disabled={savingKey === key}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#8E1018] text-white font-bold text-xs hover:bg-[#730B12] disabled:opacity-50 whitespace-nowrap"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingKey === key ? 'Đang lưu...' : 'Cập nhật'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Supabase Storage & SQL info */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-3">
        <h3 className="text-lg font-bold text-[#6b0b12] pb-2 border-b border-[#e3b8bb] m-0 flex items-center gap-2">
          <Database className="w-5 h-5 text-[#8E1018]" />
          <span>3. Kho lưu trữ tệp trực tuyến trên Supabase</span>
        </h3>
        <div className="text-[14.5px] text-[#3a2526] space-y-1.5">
          <p className="m-0">
            Toàn bộ tệp PDF, Word, Excel và ảnh chụp do Đảng viên / Chi bộ tải lên được lưu trực tiếp trong{' '}
            <strong>Supabase Storage</strong> tại kho (Bucket):{' '}
            <code className="px-1.5 py-0.5 bg-[#FAF8F3] border border-[#d5969a] text-[#8E1018] font-bold">
              {STORAGE_BUCKET}
            </code>
          </p>
          <p className="m-0">
            Cấu trúc thư mục tự động:{' '}
            <code className="px-1.5 py-0.5 bg-[#FAF8F3] border border-[#d5969a] text-[#6b0b12]">
              Năm / Đơn vị (dang-bo, cb1..cb4, ubkt) / Mã hồ sơ / Mục tài liệu / Tên tệp
            </code>
          </p>
          <p className="m-0 text-sm text-[#5c4748]">
            Admin có thể xem, tải từng tệp trực tiếp ngay trong phần mềm hoặc vào trang quản trị <strong>Supabase → Storage → {STORAGE_BUCKET}</strong> để sao lưu thư mục theo từng Chi bộ.
          </p>
        </div>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => void handleCopy('supabase_sql', SUPABASE_SETUP_SQL)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-sm hover:bg-[#FBF0C9]"
          >
            {copiedId === 'supabase_sql' ? (
              <>
                <Check className="w-4 h-4" />
                Đã sao chép mã SQL cấu hình Supabase
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Sao chép lại mã SQL cấu hình Supabase
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
