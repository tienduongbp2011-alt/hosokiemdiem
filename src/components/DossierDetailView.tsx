import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  History,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  deleteFileFromSupabaseStorage,
  downloadFileFromSupabaseStorage,
  uploadFileToSupabaseStorage,
} from '../services/supabaseService';
import {
  ALLOWED_EXTENSIONS,
  AttachmentMeta,
  DocumentRequirement,
  Dossier,
  MAX_FILE_SIZE_BYTES,
  POSITION_GROUPS,
  PortalSession,
  PositionGroup,
  RATING_OPTIONS,
  REQUIREMENT_OPTIONS,
  RatingLevel,
  RevisionRequest,
  StoredFileRecord,
  formatDateTimeVN,
  formatDateVN,
  formatFileSize,
  getDossierDisplayName,
  getUnitSecretaryRoleLabel,
  getVisibleDocuments,
} from '../types';
import { StatusText } from './StatusText';

interface DossierDetailViewProps {
  dossier: Dossier;
  session: PortalSession;
  onBack?: () => void;
  onUpdateDossier: (updated: Dossier, successMessage?: string) => Promise<void>;
  onPreviewFile: (record: StoredFileRecord) => void;
  onDownloadFile: (record: StoredFileRecord) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const DossierDetailView: React.FC<DossierDetailViewProps> = ({
  dossier,
  session,
  onBack,
  onUpdateDossier,
  onPreviewFile,
  onDownloadFile,
  onNotify,
}) => {
  const [draft, setDraft] = useState<Dossier>(dossier);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revMissingSelected, setRevMissingSelected] = useState<string[]>([]);
  const [revOtherMissing, setRevOtherMissing] = useState('');
  const [revDetails, setRevDetails] = useState('');
  const [revDeadline, setRevDeadline] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string>('');

  useEffect(() => {
    setDraft(dossier);
    setShowRevisionForm(false);
    setRevMissingSelected([]);
    setRevOtherMissing('');
    setRevDetails('');
    setRevDeadline('');
  }, [dossier.id, dossier.updatedAt]);

  const actorLabel = useMemo(() => {
    if (session.type === 'admin') return 'Admin Đảng uỷ (Nguyễn Tiến Dương)';
    if (session.type === 'branch') return getUnitSecretaryRoleLabel(session.branch);
    return `Đảng viên (${getDossierDisplayName(draft)})`;
  }, [session, draft]);

  const isAdmin = session.type === 'admin';
  const isBranch =
    session.type === 'branch' && session.unitKey === draft.unitKey;
  const isMember =
    session.type === 'member' &&
    session.dossierId === draft.id &&
    draft.type === 'individual';

  const memberCanEdit =
    isMember &&
    (draft.status === 'Chưa nộp' ||
      draft.status === 'Chờ Chi bộ kiểm tra' ||
      draft.status === 'Cần bổ sung');

  const branchCanEdit = isBranch && draft.status !== 'Đã hoàn tất';
  const adminCanEdit = isAdmin;

  const canEditBasicPositionAndDocs =
    memberCanEdit || branchCanEdit || adminCanEdit;
  const canEditFullName = branchCanEdit || adminCanEdit;
  const canEditSelfRating =
    draft.type === 'individual' &&
    (memberCanEdit || branchCanEdit || adminCanEdit);
  const canEditBranchRating = branchCanEdit || adminCanEdit;
  const canEditOfficialRating = isAdmin;

  const canMemberSubmit =
    isMember &&
    (draft.status === 'Chưa nộp' || draft.status === 'Cần bổ sung');

  const canBranchSubmitToParty =
    isBranch &&
    (draft.status === 'Chưa nộp' ||
      draft.status === 'Chờ Chi bộ kiểm tra' ||
      draft.status === 'Cần bổ sung');

  const canBranchReturnToMember =
    isBranch &&
    draft.type === 'individual' &&
    draft.status === 'Chờ Chi bộ kiểm tra';

  const canAdminRequestRevision =
    isAdmin &&
    (draft.status === 'Đang rà soát' ||
      draft.status === 'Chờ Chi bộ kiểm tra');

  const canAdminFinalize = isAdmin;

  const visibleDocuments = useMemo(() => getVisibleDocuments(draft), [draft]);

  const lockBanner = useMemo(() => {
    if (isMember && draft.status === 'Đang rà soát') {
      return 'Hồ sơ của đồng chí đã được Chi bộ chuyển lên Đảng uỷ rà soát. Hiện không thể chỉnh sửa cho đến khi có yêu cầu bổ sung (nếu có).';
    }
    if (isMember && draft.status === 'Đã hoàn tất') {
      return 'Hồ sơ đã hoàn tất xếp loại chính thức và đã được khoá chỉnh sửa.';
    }
    if (isBranch && draft.status === 'Đã hoàn tất') {
      return 'Hồ sơ đã được Đảng uỷ chốt kết quả chính thức và đã khoá chỉnh sửa từ phía Chi bộ.';
    }
    return '';
  }, [isMember, isBranch, draft.status]);

  const handleFieldChange = <K extends keyof Dossier>(
    key: K,
    value: Dossier[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleDocRequirementChange = (
    docKey: string,
    req: DocumentRequirement
  ) => {
    setDraft((prev) => ({
      ...prev,
      documents: prev.documents.map((doc) =>
        doc.key === docKey ? { ...doc, requirement: req } : doc
      ),
    }));
  };

  const handleDocFormVersionChange = (docKey: string, formVersion: string) => {
    setDraft((prev) => ({
      ...prev,
      documents: prev.documents.map((doc) =>
        doc.key === docKey ? { ...doc, formVersion } : doc
      ),
    }));
  };

  const handleUploadFiles = async (
    docKey: string,
    fileList: FileList | null
  ) => {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const validFiles: File[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        onNotify(
          'error',
          `Tệp "${file.name}" không hợp lệ. Chỉ chấp nhận PDF, Word (.doc, .docx), Excel (.xls, .xlsx), JPG và PNG.`
        );
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        onNotify(
          'error',
          `Tệp "${file.name}" vượt quá dung lượng tối đa 25 MB để tải lên Supabase Storage.`
        );
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setIsSaving(true);
    const now = new Date().toISOString();
    const addedMetas: AttachmentMeta[] = [];

    try {
      for (const file of validFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const fileId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const storagePath = await uploadFileToSupabaseStorage({
          file,
          fileId,
          dossier: draft,
          docKey,
          extension: ext,
        });

        addedMetas.push({
          id: fileId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          extension: ext,
          uploadedAt: now,
          uploadedByRole: actorLabel,
          storagePath,
        });
      }

      const targetDoc = draft.documents.find((d) => d.key === docKey);
      const updatedDossier: Dossier = {
        ...draft,
        updatedAt: now,
        documents: draft.documents.map((doc) =>
          doc.key === docKey
            ? { ...doc, attachments: [...doc.attachments, ...addedMetas] }
            : doc
        ),
        history: [
          ...draft.history.slice(-140),
          {
            id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: now,
            role: actorLabel,
            action: 'Đính kèm tệp tài liệu',
            note: `Đã tải lên ${addedMetas.map((m) => m.name).join(', ')} vào mục "${targetDoc?.title ?? docKey}".`,
          },
        ],
      };

      setDraft(updatedDossier);
      await onUpdateDossier(
        updatedDossier,
        `Đã tải lên và đồng bộ ${addedMetas.length} tệp đính kèm.`
      );
    } catch {
      onNotify(
        'error',
        'Không thể tải tệp lên Supabase Storage. Vui lòng kiểm tra dung lượng (tối đa 25 MB) và thử lại.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAttachment = async (docKey: string, meta: AttachmentMeta) => {
    setIsSaving(true);
    const now = new Date().toISOString();
    try {
      await deleteFileFromSupabaseStorage(meta.storagePath);
      const targetDoc = draft.documents.find((d) => d.key === docKey);
      const updatedDossier: Dossier = {
        ...draft,
        updatedAt: now,
        documents: draft.documents.map((doc) =>
          doc.key === docKey
            ? {
                ...doc,
                attachments: doc.attachments.filter((a) => a.id !== meta.id),
              }
            : doc
        ),
        history: [
          ...draft.history.slice(-140),
          {
            id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: now,
            role: actorLabel,
            action: 'Xoá tệp đính kèm',
            note: `Đã gỡ tệp "${meta.name}" tại mục "${targetDoc?.title ?? docKey}".`,
          },
        ],
      };
      setDraft(updatedDossier);
      await onUpdateDossier(updatedDossier, `Đã xoá tệp "${meta.name}".`);
    } catch {
      onNotify('error', 'Không thể xoá tệp đính kèm.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenOrDownload = async (
    att: AttachmentMeta,
    docKey: string,
    mode: 'preview' | 'download'
  ) => {
    setLoadingFileId(att.id);
    try {
      const record = await downloadFileFromSupabaseStorage(
        att,
        draft.id,
        docKey
      );
      if (!record) {
        onNotify(
          'error',
          'Không tìm thấy nội dung tệp trên kho lưu trữ Supabase.'
        );
        return;
      }
      if (mode === 'preview') {
        onPreviewFile(record);
      } else {
        onDownloadFile(record);
      }
    } catch {
      onNotify('error', 'Không thể tải nội dung tệp từ Supabase. Vui lòng thử lại.');
    } finally {
      setLoadingFileId('');
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    const now = new Date().toISOString();
    const updatedDossier: Dossier = {
      ...draft,
      updatedAt: now,
      history: [
        ...draft.history.slice(-140),
        {
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          role: actorLabel,
          action: 'Cập nhật thông tin hồ sơ',
          note: `Đã lưu thông tin hồ sơ (${getDossierDisplayName(draft)}).`,
        },
      ],
    };
    setDraft(updatedDossier);
    await onUpdateDossier(updatedDossier, 'Đã lưu thay đổi và đồng bộ trực tuyến.');
    setIsSaving(false);
  };

  const handleMemberSubmitToBranch = async () => {
    if (draft.type === 'individual' && !draft.positionGroup) {
      onNotify(
        'error',
        'Vui lòng chọn Nhóm chức vụ (để hiện Mẫu 02A/PL9 hoặc Mẫu 02B/PL10) trước khi nộp hồ sơ.'
      );
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const previousStatus = draft.status;
    const isResubmission = previousStatus === 'Cần bổ sung';

    const updatedRevisions = isResubmission
      ? draft.revisionRequests.map((req, idx) =>
          idx === draft.revisionRequests.length - 1 && !req.resolvedAt
            ? { ...req, resolvedAt: now }
            : req
        )
      : draft.revisionRequests;

    const updatedDossier: Dossier = {
      ...draft,
      status: 'Chờ Chi bộ kiểm tra',
      revisionRequests: updatedRevisions,
      updatedAt: now,
      history: [
        ...draft.history.slice(-140),
        {
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          role: actorLabel,
          action: isResubmission
            ? 'Đảng viên nộp lại hồ sơ sau bổ sung'
            : 'Đảng viên nộp hồ sơ về Chi bộ',
          fromStatus: previousStatus,
          toStatus: 'Chờ Chi bộ kiểm tra',
          note: isResubmission
            ? 'Đảng viên đã bổ sung tệp và gửi lại Chi bộ kiểm tra.'
            : 'Đảng viên đã hoàn thành tải tệp và gửi hồ sơ về Chi bộ.',
        },
      ],
    };

    setDraft(updatedDossier);
    await onUpdateDossier(
      updatedDossier,
      'Đã nộp hồ sơ về Chi bộ thành công! Trạng thái chuyển sang Chờ Chi bộ kiểm tra.'
    );
    setIsSaving(false);
  };

  const handleBranchForwardToParty = async () => {
    if (draft.type === 'individual' && !draft.positionGroup) {
      onNotify(
        'error',
        'Vui lòng chọn Nhóm chức vụ cho hồ sơ cá nhân trước khi nộp lên Đảng uỷ.'
      );
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const previousStatus = draft.status;
    const isResubmission = previousStatus === 'Cần bổ sung';

    const updatedRevisions = isResubmission
      ? draft.revisionRequests.map((req, idx) =>
          idx === draft.revisionRequests.length - 1 && !req.resolvedAt
            ? { ...req, resolvedAt: now }
            : req
        )
      : draft.revisionRequests;

    const updatedDossier: Dossier = {
      ...draft,
      status: 'Đang rà soát',
      revisionRequests: updatedRevisions,
      updatedAt: now,
      history: [
        ...draft.history.slice(-140),
        {
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          role: actorLabel,
          action: isResubmission
            ? `${getUnitSecretaryRoleLabel(draft.branch)} nộp lại hồ sơ lên Đảng uỷ`
            : `${getUnitSecretaryRoleLabel(draft.branch)} xác nhận & nộp lên Đảng uỷ`,
          fromStatus: previousStatus,
          toStatus: 'Đang rà soát',
          note: `${getUnitSecretaryRoleLabel(draft.branch)} đã kiểm tra và chuyển hồ sơ lên Đảng uỷ rà soát.`,
        },
      ],
    };

    setDraft(updatedDossier);
    await onUpdateDossier(
      updatedDossier,
      'Đã nộp hồ sơ lên Đảng uỷ thành công. Trạng thái: Đang rà soát.'
    );
    setIsSaving(false);
  };

  const handleSubmitRevisionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const missingList = [...revMissingSelected];
    if (revOtherMissing.trim()) {
      missingList.push(revOtherMissing.trim());
    }

    if (missingList.length === 0) {
      onNotify('error', 'Vui lòng chọn hoặc nhập ít nhất một mục còn thiếu.');
      return;
    }
    if (!revDetails.trim()) {
      onNotify('error', 'Vui lòng nhập nội dung cần chỉnh sửa, bổ sung.');
      return;
    }
    if (!revDeadline) {
      onNotify('error', 'Vui lòng chọn hạn nộp lại.');
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const newRequest: RevisionRequest = {
      id: `rev_${Date.now()}`,
      createdAt: now,
      requestedByRole: actorLabel,
      missingItems: missingList,
      details: revDetails.trim(),
      deadline: revDeadline,
    };

    const updatedDossier: Dossier = {
      ...draft,
      status: 'Cần bổ sung',
      revisionRequests: [...draft.revisionRequests.slice(-45), newRequest],
      updatedAt: now,
      history: [
        ...draft.history.slice(-140),
        {
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          role: actorLabel,
          action: 'Yêu cầu bổ sung hồ sơ',
          fromStatus: draft.status,
          toStatus: 'Cần bổ sung',
          note: `Thiếu: ${missingList.join(', ')}. Nội dung: ${revDetails.trim()}. Hạn nộp lại: ${formatDateVN(
            revDeadline
          )}.`,
        },
      ],
    };

    setDraft(updatedDossier);
    await onUpdateDossier(
      updatedDossier,
      'Đã gửi yêu cầu bổ sung. Trạng thái chuyển sang Cần bổ sung.'
    );
    setShowRevisionForm(false);
    setRevMissingSelected([]);
    setRevOtherMissing('');
    setRevDetails('');
    setRevDeadline('');
    setIsSaving(false);
  };

  const handleAdminFinalize = async () => {
    if (!draft.officialRating) {
      onNotify(
        'error',
        'Vui lòng chọn Mức xếp loại chính thức trước khi chốt kết quả.'
      );
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const previousStatus = draft.status;
    const isUpdateOnly = previousStatus === 'Đã hoàn tất';

    const updatedDossier: Dossier = {
      ...draft,
      status: 'Đã hoàn tất',
      updatedAt: now,
      history: [
        ...draft.history.slice(-140),
        {
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          role: actorLabel,
          action: isUpdateOnly
            ? 'Cập nhật kết quả xếp loại chính thức'
            : 'Chốt kết quả xếp loại chính thức',
          fromStatus: previousStatus,
          toStatus: 'Đã hoàn tất',
          note: `Mức xếp loại chính thức: ${draft.officialRating}.`,
        },
      ],
    };

    setDraft(updatedDossier);
    await onUpdateDossier(
      updatedDossier,
      `Đã chốt kết quả chính thức (${draft.officialRating}). Trạng thái: Đã hoàn tất.`
    );
    setIsSaving(false);
  };

  const toggleMissingItem = (title: string) => {
    setRevMissingSelected((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const latestRevision =
    draft.revisionRequests.length > 0
      ? draft.revisionRequests[draft.revisionRequests.length - 1]
      : null;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-[#8E1018]">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9] whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-[#6b0b12] m-0 truncate">
              {draft.type === 'collective'
                ? `Hồ sơ tập thể: ${getDossierDisplayName(draft)}`
                : `Hồ sơ cá nhân: ${getDossierDisplayName(draft)}`}
            </h2>
            <div className="text-[14px] text-[#5c4748] flex flex-wrap items-center gap-x-2">
              <span>Mã hồ sơ: {draft.code}</span>
              <span aria-hidden="true">·</span>
              <span>{draft.branch}</span>
              <span aria-hidden="true">·</span>
              <span>Năm {draft.year}</span>
              <span aria-hidden="true">·</span>
              <span>
                Trạng thái: <StatusText status={draft.status} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {lockBanner && (
        <div className="bg-[#FCF8E8] border border-[#C99B35] px-4 py-3 text-[15px] text-[#4b3512]">
          <strong>Trạng thái khoá hồ sơ:</strong> {lockBanner}
        </div>
      )}

      {/* Active revision request alert */}
      {draft.status === 'Cần bổ sung' && latestRevision && (
        <div className="bg-[#FDF1F2] border-2 border-[#8E1018] p-4 space-y-2">
          <div className="flex items-center gap-2 text-[#8E1018] font-bold text-[17px]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              Hồ sơ đang có yêu cầu bổ sung (Hạn nộp lại:{' '}
              {formatDateVN(latestRevision.deadline)})
            </span>
          </div>
          <div className="text-[15px] text-[#331a1c] space-y-1">
            <p className="m-0">
              <strong>Mục còn thiếu:</strong>{' '}
              {latestRevision.missingItems.join('; ')}
            </p>
            <p className="m-0">
              <strong>Nội dung cần chỉnh sửa:</strong> {latestRevision.details}
            </p>
            <p className="m-0 text-sm text-[#634749]">
              Yêu cầu bởi {latestRevision.requestedByRole} lúc{' '}
              {formatDateTimeVN(latestRevision.createdAt)}
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Basic Info + Ratings */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-5">
        <h3 className="text-lg font-bold text-[#6b0b12] pb-2 border-b border-[#e3b8bb] m-0">
          1. Thông tin chung và kết quả xếp loại
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
              Mã hồ sơ
            </label>
            <input
              type="text"
              value={draft.code}
              disabled
              className="w-full px-3 py-2 border border-[#d5969a] bg-[#f7f4ee] text-[#3a2a2b] font-bold"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
              {draft.type === 'collective'
                ? 'Tên tập thể'
                : 'Họ và tên đảng viên'}
            </label>
            <input
              type="text"
              value={draft.fullName}
              onChange={(e) => handleFieldChange('fullName', e.target.value)}
              disabled={!canEditFullName}
              placeholder={
                draft.type === 'individual'
                  ? `Để trống sẽ hiển thị mã ${draft.code}`
                  : 'Nhập tên tập thể'
              }
              className="w-full px-3 py-2 border border-[#b8424a] bg-white disabled:bg-[#f7f4ee] disabled:text-[#5c4d4e] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
              Đơn vị / Năm kiểm điểm
            </label>
            <input
              type="text"
              value={`${draft.branch} — Năm ${draft.year}`}
              disabled
              className="w-full px-3 py-2 border border-[#d5969a] bg-[#f7f4ee] text-[#3a2a2b]"
            />
          </div>

          {draft.type === 'individual' && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
                Nhóm chức vụ (tự động hiển thị đúng biểu mẫu kiểm điểm)
              </label>
              <select
                value={draft.positionGroup}
                onChange={(e) =>
                  handleFieldChange(
                    'positionGroup',
                    e.target.value as PositionGroup
                  )
                }
                disabled={!canEditBasicPositionAndDocs}
                className="w-full md:w-[460px] px-3 py-2 border border-[#b8424a] bg-white disabled:bg-[#f7f4ee] disabled:text-[#5c4d4e] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
              >
                <option value="">-- Chưa chọn nhóm chức vụ --</option>
                {POSITION_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <p className="text-sm text-[#665052] mt-1 mb-0">
                Giữ chức vụ lãnh đạo, quản lý → <strong>Mẫu 02A &amp; Phụ lục 9</strong>; Không giữ chức vụ → <strong>Mẫu 02B &amp; Phụ lục 10</strong>; kèm <strong>Phiếu BSLL Mẫu 3</strong> và <strong>Phiếu nhận xét nơi cư trú (Quy định 221)</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Ratings grid */}
        <div className="pt-3 border-t border-[#eed1d3]">
          <p className="text-[15px] font-bold text-[#6b0b12] mb-3 mt-0">
            Mức đề xuất và xếp loại chất lượng (lưu độc lập theo từng cấp)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {draft.type === 'individual' && (
              <div>
                <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
                  Mức cá nhân tự đề xuất
                </label>
                <select
                  value={draft.selfProposedRating}
                  onChange={(e) =>
                    handleFieldChange(
                      'selfProposedRating',
                      e.target.value as RatingLevel
                    )
                  }
                  disabled={!canEditSelfRating}
                  className="w-full px-3 py-2 border border-[#b8424a] bg-white disabled:bg-[#f7f4ee] disabled:text-[#5c4d4e] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
                >
                  <option value="">-- Chưa chọn --</option>
                  {RATING_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
                {draft.type === 'collective'
                  ? 'Mức tập thể / Chi bộ đề nghị'
                  : 'Mức chi bộ đề nghị'}
              </label>
              <select
                value={draft.branchProposedRating}
                onChange={(e) =>
                  handleFieldChange(
                    'branchProposedRating',
                    e.target.value as RatingLevel
                  )
                }
                disabled={!canEditBranchRating}
                className="w-full px-3 py-2 border border-[#b8424a] bg-white disabled:bg-[#f7f4ee] disabled:text-[#5c4d4e] focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
              >
                <option value="">-- Chưa chọn --</option>
                {RATING_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[14px] font-bold text-[#8E1018] mb-1">
                Mức xếp loại chính thức (Admin Đảng uỷ)
              </label>
              <select
                value={draft.officialRating}
                onChange={(e) =>
                  handleFieldChange(
                    'officialRating',
                    e.target.value as RatingLevel
                  )
                }
                disabled={!canEditOfficialRating}
                className="w-full px-3 py-2 border-2 border-[#8E1018] bg-[#FFFDF5] disabled:bg-[#f7f4ee] disabled:border-[#d5969a] disabled:text-[#5c4d4e] font-bold focus:outline-none focus:ring-2 focus:ring-[#F6CF62]"
              >
                <option value="">-- Chưa có kết quả chính thức --</option>
                {RATING_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Workflow Action Bar */}
        <div className="pt-4 border-t border-[#eed1d3] flex flex-wrap items-center gap-3">
          {canEditBasicPositionAndDocs && (
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9] disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              Lưu thay đổi
            </button>
          )}

          {canMemberSubmit && (
            <button
              type="button"
              onClick={() => void handleMemberSubmitToBranch()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              {draft.status === 'Cần bổ sung'
                ? 'Nộp lại hồ sơ về Chi bộ'
                : 'Nộp hồ sơ về Chi bộ'}
            </button>
          )}

          {canBranchSubmitToParty && (
            <button
              type="button"
              onClick={() => void handleBranchForwardToParty()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              {draft.status === 'Cần bổ sung'
                ? 'Nộp lại lên Đảng uỷ'
                : 'Xác nhận & Nộp lên Đảng uỷ'}
            </button>
          )}

          {(canBranchReturnToMember || canAdminRequestRevision) && (
            <button
              type="button"
              onClick={() => setShowRevisionForm((v) => !v)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#B45309] text-white font-bold hover:bg-[#92400E] disabled:opacity-50 whitespace-nowrap"
            >
              <AlertTriangle className="w-4 h-4" />
              {canBranchReturnToMember
                ? 'Trả lại yêu cầu bổ sung'
                : 'Yêu cầu bổ sung'}
            </button>
          )}

          {canAdminFinalize && (
            <button
              type="button"
              onClick={() => void handleAdminFinalize()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#166534] text-white font-bold hover:bg-[#14532d] disabled:opacity-50 whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4" />
              {draft.status === 'Đã hoàn tất'
                ? 'Cập nhật kết quả chính thức'
                : 'Chốt kết quả chính thức'}
            </button>
          )}
        </div>

        {/* Revision request form */}
        {showRevisionForm &&
          (canBranchReturnToMember || canAdminRequestRevision) && (
            <form
              onSubmit={(e) => void handleSubmitRevisionRequest(e)}
              className="mt-4 bg-[#FCF8E8] border-2 border-[#B45309] p-4 space-y-4"
            >
              <h4 className="text-base font-bold text-[#7C2D12] m-0">
                Phiếu yêu cầu bổ sung hồ sơ
              </h4>

              <div>
                <label className="block text-[14px] font-bold text-[#4a2629] mb-2">
                  Chọn các mục tài liệu còn thiếu hoặc cần chỉnh sửa:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {visibleDocuments.map((doc) => (
                    <label
                      key={doc.key}
                      className="flex items-start gap-2 text-[14px] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={revMissingSelected.includes(doc.title)}
                        onChange={() => toggleMissingItem(doc.title)}
                        className="mt-1 accent-[#8E1018]"
                      />
                      <span>{doc.title}</span>
                    </label>
                  ))}
                </div>
                <input
                  type="text"
                  value={revOtherMissing}
                  onChange={(e) => setRevOtherMissing(e.target.value)}
                  placeholder="Hoặc nhập mục thiếu khác (nếu có)..."
                  className="mt-2 w-full px-3 py-2 border border-[#b8424a] bg-white text-[14px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
                    Nội dung yêu cầu chỉnh sửa, bổ sung *
                  </label>
                  <textarea
                    rows={3}
                    value={revDetails}
                    onChange={(e) => setRevDetails(e.target.value)}
                    placeholder="Ghi rõ nội dung cần bổ sung, chữ ký, dấu xác nhận nơi cư trú..."
                    className="w-full px-3 py-2 border border-[#b8424a] bg-white text-[14px]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-bold text-[#4a2629] mb-1">
                    Hạn nộp lại *
                  </label>
                  <input
                    type="date"
                    value={revDeadline}
                    onChange={(e) => setRevDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-[#b8424a] bg-white text-[14px]"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#8E1018] text-white font-bold hover:bg-[#730B12]"
                >
                  Gửi yêu cầu bổ sung
                </button>
                <button
                  type="button"
                  onClick={() => setShowRevisionForm(false)}
                  className="px-4 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
                >
                  Huỷ
                </button>
              </div>
            </form>
          )}
      </section>

      {/* Section 2: Document Checklist & Attachments */}
      <section className="bg-white border border-[#b8424a] p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b border-[#e3b8bb]">
          <h3 className="text-lg font-bold text-[#6b0b12] m-0">
            2. Danh mục tài liệu và tệp đính kèm trực tuyến
          </h3>
          <span className="text-sm text-[#5c4748]">
            Lưu trữ Supabase Storage · Hỗ trợ: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), JPG, PNG (tối đa 25 MB/tệp)
          </span>
        </div>

        {draft.type === 'individual' && !draft.positionGroup && (
          <div className="bg-[#FCF8E8] border border-[#D4A73E] p-3.5 text-[15px] text-[#4b3512]">
            Chưa chọn <strong>Nhóm chức vụ</strong>. Vui lòng chọn nhóm chức vụ ở mục 1 để hiển thị đầy đủ <strong>Mẫu 02A &amp; Phụ lục 9</strong> (lãnh đạo, quản lý) hoặc <strong>Mẫu 02B &amp; Phụ lục 10</strong> (không giữ chức vụ). Mục <strong>Phiếu BSLL Mẫu 3</strong> và <strong>Quy định nơi cư trú 221</strong> đã sẵn sàng đính kèm bên dưới.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="party-table text-[15px]">
            <thead>
              <tr>
                <th className="w-12 text-center">STT</th>
                <th className="min-w-[280px]">Tên tài liệu / Biểu mẫu</th>
                <th className="w-44">Yêu cầu áp dụng</th>
                <th className="min-w-[290px]">Tệp đính kèm</th>
              </tr>
            </thead>
            <tbody>
              {visibleDocuments.map((doc, idx) => (
                <tr key={doc.key}>
                  <td className="text-center tabular-nums font-bold">
                    {idx + 1}
                  </td>
                  <td>
                    <div className="font-bold text-[#2b1416]">{doc.title}</div>
                    {doc.description && (
                      <div className="text-[13px] text-[#5e4a4b] mt-0.5">
                        {doc.description}
                      </div>
                    )}
                    {doc.supportsFormVersion && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-[13px] font-bold text-[#6b0b12]">
                          Năm / Phiên bản biểu mẫu:
                        </label>
                        <input
                          type="text"
                          value={doc.formVersion ?? ''}
                          onChange={(e) =>
                            handleDocFormVersionChange(doc.key, e.target.value)
                          }
                          disabled={!canEditBasicPositionAndDocs}
                          placeholder="VD: Năm 2026 – Phiên bản 1.0"
                          className="px-2.5 py-1 text-[14px] border border-[#b8424a] bg-white disabled:bg-[#f7f4ee] w-60"
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    <select
                      value={doc.requirement}
                      onChange={(e) =>
                        handleDocRequirementChange(
                          doc.key,
                          e.target.value as DocumentRequirement
                        )
                      }
                      disabled={!canEditBasicPositionAndDocs}
                      className="w-full px-2.5 py-1.5 text-[14px] border border-[#b8424a] bg-white disabled:bg-[#f7f4ee] disabled:text-[#5c4d4e]"
                    >
                      {REQUIREMENT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="space-y-2">
                      {doc.attachments.length === 0 ? (
                        <div className="text-[14px] italic text-[#735e60]">
                          Chưa có tệp đính kèm
                        </div>
                      ) : (
                        <ul className="list-none m-0 p-0 space-y-1.5">
                          {doc.attachments.map((att) => (
                            <li
                              key={att.id}
                              className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF7EF] border border-[#e3c8c9] px-2.5 py-1.5 text-[14px]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-[#2b1416] truncate">
                                  {att.name}
                                </div>
                                <div className="text-xs text-[#634c4e] tabular-nums">
                                  {formatFileSize(att.size)} ·{' '}
                                  {formatDateTimeVN(att.uploadedAt)}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={loadingFileId === att.id}
                                  onClick={() =>
                                    void handleOpenOrDownload(
                                      att,
                                      doc.key,
                                      'preview'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold border border-[#8E1018] text-[#8E1018] bg-white hover:bg-[#FBF0C9] disabled:opacity-50"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  {loadingFileId === att.id ? '...' : 'Mở'}
                                </button>
                                <button
                                  type="button"
                                  disabled={loadingFileId === att.id}
                                  onClick={() =>
                                    void handleOpenOrDownload(
                                      att,
                                      doc.key,
                                      'download'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold border border-[#8E1018] text-[#8E1018] bg-white hover:bg-[#FBF0C9] disabled:opacity-50"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Tải
                                </button>
                                {canEditBasicPositionAndDocs && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteAttachment(doc.key, att)
                                    }
                                    disabled={isSaving}
                                    className="inline-flex items-center p-1 text-xs border border-[#8E1018] text-[#8E1018] bg-white hover:bg-[#FDF1F2]"
                                    aria-label={`Xoá tệp ${att.name}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      {canEditBasicPositionAndDocs &&
                        doc.requirement !== 'Không áp dụng' && (
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-bold bg-[#FBF0C9] border border-[#8E1018] text-[#6b0b12] hover:bg-[#F6CF62] cursor-pointer whitespace-nowrap">
                            <FileUp className="w-4 h-4" />
                            <span>
                              {isSaving ? 'Đang tải lên...' : 'Đính kèm tệp'}
                            </span>
                            <input
                              type="file"
                              multiple
                              disabled={isSaving}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                              className="hidden"
                              onChange={(e) => {
                                void handleUploadFiles(doc.key, e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Revision History & Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-[#b8424a] p-5 space-y-3">
          <h3 className="text-lg font-bold text-[#6b0b12] pb-2 border-b border-[#e3b8bb] m-0 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#8E1018]" />
            <span>
              Lịch sử yêu cầu bổ sung ({draft.revisionRequests.length})
            </span>
          </h3>

          {draft.revisionRequests.length === 0 ? (
            <p className="text-[15px] italic text-[#695557] m-0">
              Chưa có yêu cầu bổ sung nào đối với hồ sơ này.
            </p>
          ) : (
            <div className="space-y-3">
              {[...draft.revisionRequests].reverse().map((req, idx) => (
                <div
                  key={req.id}
                  className="border border-[#d5969a] bg-[#FAF8F3] p-3.5 text-[14px] space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#6b0b12]">
                    <span>
                      Lần yêu cầu #{draft.revisionRequests.length - idx}
                    </span>
                    <span className="tabular-nums text-xs text-[#594446]">
                      {formatDateTimeVN(req.createdAt)} · {req.requestedByRole}
                    </span>
                  </div>
                  <p className="m-0">
                    <strong>Mục còn thiếu:</strong>{' '}
                    {req.missingItems.join('; ')}
                  </p>
                  <p className="m-0">
                    <strong>Nội dung yêu cầu:</strong> {req.details}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <span className="font-bold text-[#8E1018] tabular-nums">
                      Hạn nộp lại: {formatDateVN(req.deadline)}
                    </span>
                    {req.resolvedAt ? (
                      <span className="text-[#166534] font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Đã nộp lại lúc {formatDateTimeVN(req.resolvedAt)}
                      </span>
                    ) : (
                      <span className="text-[#92400E] font-bold">
                        Đang chờ bổ sung
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-[#b8424a] p-5 space-y-3">
          <h3 className="text-lg font-bold text-[#6b0b12] pb-2 border-b border-[#e3b8bb] m-0 flex items-center gap-2">
            <History className="w-5 h-5 text-[#8E1018]" />
            <span>Lịch sử cập nhật ({draft.history.length})</span>
          </h3>

          {draft.history.length === 0 ? (
            <p className="text-[15px] italic text-[#695557] m-0">
              Chưa có cập nhật nào được ghi nhận (hồ sơ ở trạng thái khởi tạo Chưa nộp).
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {[...draft.history].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className="border-b border-[#ead0d2] pb-2.5 last:border-b-0 text-[14px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#6b0b12]">
                      {entry.action}
                      {entry.fromStatus && entry.toStatus && (
                        <span className="font-normal text-[#4a3234]">
                          {' '}
                          ({entry.fromStatus} → {entry.toStatus})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-[#634c4e] tabular-nums">
                      {formatDateTimeVN(entry.timestamp)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#8E1018] mt-0.5">
                    Thực hiện bởi: {entry.role}
                  </div>
                  <p className="m-0 mt-0.5 text-[#332122]">{entry.note}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
