export type BranchUnitName = 'Chi bộ 1' | 'Chi bộ 2' | 'Chi bộ 3' | 'Chi bộ 4';

export type UnitName =
  | 'Đảng bộ trường'
  | BranchUnitName
  | 'UBKT Đảng uỷ';

export type UnitKey = 'dang-bo' | 'cb1' | 'cb2' | 'cb3' | 'cb4' | 'ubkt';

export type BranchUnitKey = 'cb1' | 'cb2' | 'cb3' | 'cb4';

export type DossierType = 'collective' | 'individual';

export type DossierStatus =
  | 'Chưa nộp'
  | 'Chờ Chi bộ kiểm tra'
  | 'Đang rà soát'
  | 'Cần bổ sung'
  | 'Đã hoàn tất';

export type PositionGroup =
  | ''
  | 'Giữ chức vụ lãnh đạo, quản lý'
  | 'Không giữ chức vụ lãnh đạo, quản lý';

export type RatingLevel =
  | ''
  | 'Hoàn thành xuất sắc nhiệm vụ'
  | 'Hoàn thành tốt nhiệm vụ'
  | 'Hoàn thành nhiệm vụ'
  | 'Không hoàn thành nhiệm vụ';

export type DocumentRequirement =
  | 'Bắt buộc'
  | 'Theo trường hợp'
  | 'Không áp dụng';

export type PortalMode = 'gateway' | 'member' | 'branch' | 'admin' | 'voting';

export type NavSection =
  | 'overview'
  | 'collective'
  | 'individual'
  | 'voting'
  | 'summary'
  | 'access';

export interface MemberSession {
  type: 'member';
  dossierId: string;
  branch: BranchUnitName;
  unitKey: BranchUnitKey;
}

export interface BranchSession {
  type: 'branch';
  branch: UnitName;
  unitKey: UnitKey;
  branchProof: string;
}

export interface AdminSession {
  type: 'admin';
  uid: string;
  email: string;
  displayName: string;
}

export type PortalSession = MemberSession | BranchSession | AdminSession;

export interface BranchAccessRecord {
  unitKey: UnitKey;
  unitName: UnitName;
  passwordHash: string;
  hintLabel?: string;
  updatedAt: string;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  uploadedAt: string;
  uploadedByRole: string;
  storagePath?: string;
}

export interface DocumentItem {
  key: string;
  title: string;
  description?: string;
  requirement: DocumentRequirement;
  formVersion?: string;
  supportsFormVersion?: boolean;
  applicableGroup?: 'leader' | 'non-leader' | 'all';
  attachments: AttachmentMeta[];
}

export interface RevisionRequest {
  id: string;
  createdAt: string;
  requestedByRole: string;
  missingItems: string[];
  details: string;
  deadline: string; // YYYY-MM-DD
  resolvedAt?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  role: string;
  action: string;
  fromStatus?: DossierStatus;
  toStatus?: DossierStatus;
  note: string;
}

export interface Dossier {
  id: string;
  code: string;
  type: DossierType;
  branch: UnitName;
  unitKey: UnitKey;
  year: number;
  fullName: string;
  positionGroup: PositionGroup;
  status: DossierStatus;
  selfProposedRating: RatingLevel;
  branchProposedRating: RatingLevel;
  officialRating: RatingLevel;
  documents: DocumentItem[];
  revisionRequests: RevisionRequest[];
  history: HistoryEntry[];
  branchProof?: string;
  updatedAt: string;
}

export interface StoredFileRecord {
  id: string;
  dossierId: string;
  docKey: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  uploadedAt: string;
  uploadedByLabel: string;
  blob: Blob;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export const BRANCH_LIST: BranchUnitName[] = [
  'Chi bộ 1',
  'Chi bộ 2',
  'Chi bộ 3',
  'Chi bộ 4',
];

export const ALL_UNITS: UnitName[] = [
  'Đảng bộ trường',
  'Chi bộ 1',
  'Chi bộ 2',
  'Chi bộ 3',
  'Chi bộ 4',
  'UBKT Đảng uỷ',
];

export const UNIT_KEY_MAP: Record<UnitName, UnitKey> = {
  'Đảng bộ trường': 'dang-bo',
  'Chi bộ 1': 'cb1',
  'Chi bộ 2': 'cb2',
  'Chi bộ 3': 'cb3',
  'Chi bộ 4': 'cb4',
  'UBKT Đảng uỷ': 'ubkt',
};

export const UNIT_NAME_BY_KEY: Record<UnitKey, UnitName> = {
  'dang-bo': 'Đảng bộ trường',
  cb1: 'Chi bộ 1',
  cb2: 'Chi bộ 2',
  cb3: 'Chi bộ 3',
  cb4: 'Chi bộ 4',
  ubkt: 'UBKT Đảng uỷ',
};

export function isCollectiveOnlyUnit(unit: UnitName): boolean {
  return unit === 'Đảng bộ trường' || unit === 'UBKT Đảng uỷ';
}

export function getUnitSecretaryRoleLabel(unit: UnitName): string {
  if (unit === 'Đảng bộ trường') return 'Thư ký Đảng bộ trường';
  if (unit === 'UBKT Đảng uỷ') return 'Thư ký UBKT Đảng uỷ';
  return `Bí thư / Thư ký ${unit}`;
}

export const STATUS_LIST: DossierStatus[] = [
  'Chưa nộp',
  'Chờ Chi bộ kiểm tra',
  'Đang rà soát',
  'Cần bổ sung',
  'Đã hoàn tất',
];

export const RATING_OPTIONS: Exclude<RatingLevel, ''>[] = [
  'Hoàn thành xuất sắc nhiệm vụ',
  'Hoàn thành tốt nhiệm vụ',
  'Hoàn thành nhiệm vụ',
  'Không hoàn thành nhiệm vụ',
];

export const POSITION_GROUPS: Exclude<PositionGroup, ''>[] = [
  'Giữ chức vụ lãnh đạo, quản lý',
  'Không giữ chức vụ lãnh đạo, quản lý',
];

export const REQUIREMENT_OPTIONS: DocumentRequirement[] = [
  'Bắt buộc',
  'Theo trường hợp',
  'Không áp dụng',
];

export const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'jpg',
  'jpeg',
  'png',
];

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB on Supabase Storage

export function getDossierDisplayName(dossier: Dossier): string {
  const trimmed = dossier.fullName.trim();
  return trimmed.length > 0 ? trimmed : dossier.code;
}

export function getVisibleDocuments(dossier: Dossier): DocumentItem[] {
  if (dossier.type === 'collective') {
    return dossier.documents;
  }
  return dossier.documents.filter((doc) => {
    if (!doc.applicableGroup || doc.applicableGroup === 'all') return true;
    if (dossier.positionGroup === 'Giữ chức vụ lãnh đạo, quản lý') {
      return doc.applicableGroup === 'leader';
    }
    if (dossier.positionGroup === 'Không giữ chức vụ lãnh đạo, quản lý') {
      return doc.applicableGroup === 'non-leader';
    }
    return false;
  });
}

export function countDossierAttachments(dossier: Dossier): number {
  return getVisibleDocuments(dossier).reduce(
    (sum, doc) => sum + doc.attachments.length,
    0
  );
}

export type DocItemStatusLabel =
  | 'Đã nộp'
  | 'Chưa nộp'
  | 'Không áp dụng'
  | 'Chưa chọn nhóm';

export interface IndividualChecklistSummary {
  mau02Status: DocItemStatusLabel;
  phuLucStatus: DocItemStatusLabel;
  mau3Status: DocItemStatusLabel;
  cuTru221Status: DocItemStatusLabel;
  requiredTotal: number;
  requiredCompleted: number;
  missingShortLabels: string[];
}

export function getIndividualChecklistSummary(
  dossier: Dossier
): IndividualChecklistSummary {
  const findDoc = (key: string) => dossier.documents.find((d) => d.key === key);

  const checkDoc = (doc: DocumentItem | undefined): DocItemStatusLabel => {
    if (!doc) return 'Chưa nộp';
    if (doc.requirement === 'Không áp dụng') return 'Không áp dụng';
    return doc.attachments.length > 0 ? 'Đã nộp' : 'Chưa nộp';
  };

  let mau02Doc: DocumentItem | undefined;
  let phuLucDoc: DocumentItem | undefined;
  let mau02Short = 'Mẫu 2A/2B';
  let phuLucShort = 'PL9/PL10';

  if (dossier.positionGroup === 'Giữ chức vụ lãnh đạo, quản lý') {
    mau02Doc = findDoc('ind_mau_02a');
    phuLucDoc = findDoc('ind_phu_luc_9');
    mau02Short = 'Mẫu 02A';
    phuLucShort = 'PL9';
  } else if (dossier.positionGroup === 'Không giữ chức vụ lãnh đạo, quản lý') {
    mau02Doc = findDoc('ind_mau_02b');
    phuLucDoc = findDoc('ind_phu_luc_10');
    mau02Short = 'Mẫu 02B';
    phuLucShort = 'PL10';
  }

  const mau3Doc = findDoc('ind_mau_3_hsdv');
  const cuTruDoc = findDoc('ind_noi_cu_tru_221');

  const mau02Status: DocItemStatusLabel = dossier.positionGroup
    ? checkDoc(mau02Doc)
    : 'Chưa chọn nhóm';
  const phuLucStatus: DocItemStatusLabel = dossier.positionGroup
    ? checkDoc(phuLucDoc)
    : 'Chưa chọn nhóm';
  const mau3Status = checkDoc(mau3Doc);
  const cuTru221Status = checkDoc(cuTruDoc);

  const tracked: { doc?: DocumentItem; short: string; chosen: boolean }[] = [
    { doc: mau02Doc, short: mau02Short, chosen: Boolean(dossier.positionGroup) },
    {
      doc: phuLucDoc,
      short: phuLucShort,
      chosen: Boolean(dossier.positionGroup),
    },
    { doc: mau3Doc, short: 'Mẫu 3', chosen: true },
    { doc: cuTruDoc, short: 'QĐ 221', chosen: true },
  ];

  let requiredTotal = 0;
  let requiredCompleted = 0;
  const missingShortLabels: string[] = [];

  for (const item of tracked) {
    if (!item.chosen) {
      requiredTotal += 1;
      missingShortLabels.push(item.short);
      continue;
    }
    if (!item.doc || item.doc.requirement === 'Không áp dụng') continue;
    if (item.doc.requirement === 'Bắt buộc') {
      requiredTotal += 1;
      if (item.doc.attachments.length > 0) {
        requiredCompleted += 1;
      } else {
        missingShortLabels.push(item.short);
      }
    }
  }

  return {
    mau02Status,
    phuLucStatus,
    mau3Status,
    cuTru221Status,
    requiredTotal,
    requiredCompleted,
    missingShortLabels,
  };
}

export function formatDateTimeVN(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateVN(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================
// ONLINE SECRET BALLOT VOTING TYPES (MẪU 4 & MẪU 5)
// ============================================================

export type VotingTemplate = 'mau4' | 'mau5';

export type VotingCategory =
  | 'collective_branch'
  | 'collective_party'
  | 'collective_ubkt'
  | 'individual_committee'
  | 'individual_member';

export type VotingStatus = 'draft' | 'open' | 'closed';

export type ShortRating = 'HTXSNV' | 'HTTNV' | 'HTNV' | 'KHTNV';

export type HtxsnvMode = 'warn' | 'strict' | 'off';

export const SHORT_RATING_OPTIONS: {
  code: ShortRating;
  label: Exclude<RatingLevel, ''>;
}[] = [
  { code: 'HTXSNV', label: 'Hoàn thành xuất sắc nhiệm vụ' },
  { code: 'HTTNV', label: 'Hoàn thành tốt nhiệm vụ' },
  { code: 'HTNV', label: 'Hoàn thành nhiệm vụ' },
  { code: 'KHTNV', label: 'Không hoàn thành nhiệm vụ' },
];

export const RATING_TO_SHORT: Record<Exclude<RatingLevel, ''>, ShortRating> = {
  'Hoàn thành xuất sắc nhiệm vụ': 'HTXSNV',
  'Hoàn thành tốt nhiệm vụ': 'HTTNV',
  'Hoàn thành nhiệm vụ': 'HTNV',
  'Không hoàn thành nhiệm vụ': 'KHTNV',
};

export const SHORT_TO_RATING: Record<ShortRating, Exclude<RatingLevel, ''>> = {
  HTXSNV: 'Hoàn thành xuất sắc nhiệm vụ',
  HTTNV: 'Hoàn thành tốt nhiệm vụ',
  HTNV: 'Hoàn thành nhiệm vụ',
  KHTNV: 'Không hoàn thành nhiệm vụ',
};

export const VOTING_CATEGORY_META: Record<
  VotingCategory,
  { label: string; template: VotingTemplate; description: string }
> = {
  collective_branch: {
    label: 'Xếp loại tập thể Chi bộ (Mẫu 4)',
    template: 'mau4',
    description: 'Biểu quyết xếp loại chất lượng tập thể Chi bộ 1, 2, 3, 4',
  },
  collective_party: {
    label: 'Xếp loại tập thể Đảng bộ trường (Mẫu 4)',
    template: 'mau4',
    description: 'Biểu quyết xếp loại chất lượng tập thể Đảng bộ Trường THPT Thanh Hoà',
  },
  collective_ubkt: {
    label: 'Xếp loại tập thể UBKT Đảng uỷ (Mẫu 4)',
    template: 'mau4',
    description: 'Biểu quyết xếp loại chất lượng tập thể Ủy ban Kiểm tra Đảng uỷ',
  },
  individual_committee: {
    label: 'Xếp loại Đảng uỷ viên (Mẫu 5)',
    template: 'mau5',
    description: 'Biểu quyết xếp loại các đồng chí Uỷ viên Ban Chấp hành Đảng bộ',
  },
  individual_member: {
    label: 'Xếp loại Đảng viên theo Chi bộ (Mẫu 5)',
    template: 'mau5',
    description: 'Biểu quyết đánh giá, xếp loại đảng viên và cán bộ lãnh đạo, quản lý trong Chi bộ',
  },
};

export interface VotingCandidate {
  id: string;
  dossierId?: string;
  stt: number;
  name: string;
  position: string; // e.g., P.BTĐU, ĐUV-BTCB, P.BTCB, CUV, ĐV (for Mẫu 5)
  selfRatingShort: ShortRating | '';
  group?: 'branch' | 'ubkt'; // Dùng khi bỏ phiếu gộp 4 Chi bộ (+ UBKT) trong cùng 1 phiếu Mẫu 4
}

export interface VotingVoter {
  id: string;
  name: string;
  code?: string;
  branch?: string;
  position?: string;
}

export interface VotingSession {
  id: string;
  title: string;
  template: VotingTemplate;
  category: VotingCategory;
  unitKey: UnitKey;
  unitName: UnitName;
  year: number;
  meetingDate: string; // YYYY-MM-DD
  status: VotingStatus;
  htxsnvMode: HtxsnvMode;
  maxHtxsnvPercent: number;
  candidates: VotingCandidate[];
  eligibleVoters: VotingVoter[];
  createdBy: string;
  createdAt: string;
  closedAt?: string | null;
}

export interface VoterAttendance {
  sessionId: string;
  voterId: string;
  voterName: string;
  votedAt: string;
}

export interface CandidateTally {
  HTXSNV: number;
  HTTNV: number;
  HTNV: number;
  KHTNV: number;
}

export interface VotingTallyResult {
  status: VotingStatus;
  totalBallots: number;
  tallies: Record<string, CandidateTally>;
}

export function isMultiBranchCollectiveSession(
  session: VotingSession
): boolean {
  if (session.template !== 'mau4') return false;
  const branchTagged = session.candidates.filter((c) => c.group === 'branch');
  if (branchTagged.length >= 2) return true;
  return session.candidates.length >= 2;
}

export function hasIndependentUbktRule(session: VotingSession): boolean {
  if (session.template !== 'mau4') return false;
  const hasBranch = session.candidates.some((c) => c.group === 'branch');
  const hasUbkt = session.candidates.some((c) => c.group === 'ubkt');
  return hasBranch && hasUbkt && session.maxHtxsnvPercent >= 40;
}

export interface BranchRankingItem {
  candidate: VotingCandidate;
  htxsnvCount: number;
  htxsnvPercent: number;
  httnvCount: number;
  htnvCount: number;
  khtnvCount: number;
  rank: number;
  isTopHtxsnv: boolean;
  hasMajorityHtxsnv: boolean;
}

export interface BranchRankingSummary {
  rankedBranches: BranchRankingItem[];
  ubktCandidate?: VotingCandidate;
  ubktCounts?: CandidateTally;
  topHtxsnvCount: number;
  tiedLeaders: BranchRankingItem[];
  clearWinner: BranchRankingItem | null;
  totalBallots: number;
}

export function computeBranchRanking(
  session: VotingSession,
  tally: VotingTallyResult
): BranchRankingSummary {
  const totalBallots = tally.totalBallots;
  const hasExplicitBranch = session.candidates.some(
    (c) => c.group === 'branch'
  );
  const branchCandidates = hasExplicitBranch
    ? session.candidates.filter((c) => c.group === 'branch')
    : session.candidates.filter((c) => c.group !== 'ubkt');
  const ubktCandidate = session.candidates.find((c) => c.group === 'ubkt');

  const items: BranchRankingItem[] = branchCandidates.map((cand) => {
    const counts = tally.tallies[cand.id];
    const htxsnvCount = counts?.HTXSNV ?? 0;
    const httnvCount = counts?.HTTNV ?? 0;
    const htnvCount = counts?.HTNV ?? 0;
    const khtnvCount = counts?.KHTNV ?? 0;
    const htxsnvPercent =
      totalBallots > 0 ? (htxsnvCount / totalBallots) * 100 : 0;
    return {
      candidate: cand,
      htxsnvCount,
      htxsnvPercent,
      httnvCount,
      htnvCount,
      khtnvCount,
      rank: 1,
      isTopHtxsnv: false,
      hasMajorityHtxsnv: totalBallots > 0 && htxsnvCount > totalBallots / 2,
    };
  });

  items.sort((a, b) => {
    if (b.htxsnvCount !== a.htxsnvCount) return b.htxsnvCount - a.htxsnvCount;
    if (b.httnvCount !== a.httnvCount) return b.httnvCount - a.httnvCount;
    return a.candidate.stt - b.candidate.stt;
  });

  const topHtxsnvCount = items.length > 0 ? items[0].htxsnvCount : 0;
  items.forEach((item, idx) => {
    if (idx === 0) {
      item.rank = 1;
    } else if (item.htxsnvCount === items[idx - 1].htxsnvCount) {
      item.rank = items[idx - 1].rank;
    } else {
      item.rank = idx + 1;
    }
    item.isTopHtxsnv = topHtxsnvCount > 0 && item.htxsnvCount === topHtxsnvCount;
  });

  const tiedLeaders =
    topHtxsnvCount > 0 ? items.filter((i) => i.isTopHtxsnv) : [];
  const clearWinner =
    tiedLeaders.length === 1 && tiedLeaders[0].hasMajorityHtxsnv
      ? tiedLeaders[0]
      : null;

  return {
    rankedBranches: items,
    ubktCandidate,
    ubktCounts: ubktCandidate ? tally.tallies[ubktCandidate.id] : undefined,
    topHtxsnvCount,
    tiedLeaders,
    clearWinner,
    totalBallots,
  };
}


