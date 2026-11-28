import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Award,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Edit3,
  FileSpreadsheet,
  Lock,
  Play,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Vote,
} from 'lucide-react';
import { DEFAULT_YEAR } from '../data/seedData';
import { SUPABASE_VOTING_SQL } from '../data/supabaseSetupSql';
import { exportVotingResultToExcel } from '../services/excelService';
import {
  deleteVotingSessionAsAdmin,
  deleteVotingSessionAsBranch,
  fetchVotingTally,
  isMissingVotingTableError,
  saveVotingSessionAsAdmin,
  saveVotingSessionAsBranch,
  subscribeVotingRealtime,
} from '../services/votingService';
import {
  ALL_UNITS,
  BRANCH_LIST,
  BranchSession,
  Dossier,
  HtxsnvMode,
  AdminSession,
  RATING_TO_SHORT,
  RatingLevel,
  SHORT_RATING_OPTIONS,
  SHORT_TO_RATING,
  ShortRating,
  UNIT_KEY_MAP,
  UnitName,
  VOTING_CATEGORY_META,
  VoterAttendance,
  VotingCandidate,
  VotingCategory,
  VotingSession,
  VotingTallyResult,
  VotingTemplate,
  VotingVoter,
  computeBranchRanking,
  formatDateTimeVN,
  getDossierDisplayName,
  hasIndependentUbktRule,
  isMultiBranchCollectiveSession,
  sortCandidatesByTally,
} from '../types';
import { VotingPrintModal, getMajorityRating } from './VotingPrintModal';

export interface VotingSyncUpdate {
  dossierId: string;
  rating: Exclude<RatingLevel, ''>;
  targetField: 'branchProposedRating' | 'officialRating';
  sessionTitle: string;
}

interface VotingManagerPageProps {
  session: AdminSession | BranchSession;
  dossiers: Dossier[];
  onSyncRatingsToDossiers: (updates: VotingSyncUpdate[]) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

type FormPreset =
  | VotingCategory
  | 'multi_branch_4'
  | 'multi_branch_4_ubkt';

interface FormPresetMeta {
  label: string;
  template: VotingTemplate;
  description: string;
  dbCategory: VotingCategory;
}

const FORM_PRESET_META: Record<FormPreset, FormPresetMeta> = {
  multi_branch_4: {
    label: 'Xếp loại 4 Chi bộ trực thuộc – Tìm Chi bộ xuất sắc nhất (Mẫu 4)',
    template: 'mau4',
    description:
      'BCH Đảng uỷ bỏ phiếu đồng thời cho 4 Chi bộ (Chi bộ 1–4) trên cùng 1 phiếu Mẫu 4. Tối đa 01/04 Chi bộ đạt HTXSNV (≤ 20%) và tự động xếp hạng sau kiểm phiếu.',
    dbCategory: 'collective_party',
  },
  multi_branch_4_ubkt: {
    label: 'Xếp loại 4 Chi bộ & UBKT Đảng uỷ (gộp 5 tập thể – Mẫu 4)',
    template: 'mau4',
    description:
      'BCH Đảng uỷ bỏ phiếu cùng lúc cho 4 Chi bộ trực thuộc và UBKT Đảng uỷ trong 1 phiếu Mẫu 4 (hỗ trợ giới hạn tối đa 01 Chi bộ HTXSNV và đánh giá UBKT độc lập).',
    dbCategory: 'collective_party',
  },
  collective_branch: {
    ...VOTING_CATEGORY_META.collective_branch,
    dbCategory: 'collective_branch',
  },
  collective_party: {
    ...VOTING_CATEGORY_META.collective_party,
    dbCategory: 'collective_party',
  },
  collective_ubkt: {
    ...VOTING_CATEGORY_META.collective_ubkt,
    dbCategory: 'collective_ubkt',
  },
  individual_committee: {
    ...VOTING_CATEGORY_META.individual_committee,
    dbCategory: 'individual_committee',
  },
  individual_member: {
    ...VOTING_CATEGORY_META.individual_member,
    dbCategory: 'individual_member',
  },
};

function isMultiBranchPreset(preset: FormPreset): boolean {
  return preset === 'multi_branch_4' || preset === 'multi_branch_4_ubkt';
}

function getAllowedPresets(
  portalSession: AdminSession | BranchSession
): FormPreset[] {
  if (portalSession.type === 'admin') {
    return [
      'multi_branch_4',
      'multi_branch_4_ubkt',
      'collective_branch',
      'collective_party',
      'collective_ubkt',
      'individual_committee',
      'individual_member',
    ];
  }
  if (portalSession.unitKey === 'dang-bo') {
    return [
      'multi_branch_4',
      'multi_branch_4_ubkt',
      'collective_party',
      'individual_committee',
    ];
  }
  if (portalSession.unitKey === 'ubkt') {
    return ['collective_ubkt'];
  }
  return ['collective_branch', 'individual_member'];
}

function detectPresetFromSession(s: VotingSession): FormPreset {
  if (s.template === 'mau4' && isMultiBranchCollectiveSession(s)) {
    return s.candidates.some((c) => c.group === 'ubkt')
      ? 'multi_branch_4_ubkt'
      : 'multi_branch_4';
  }
  return s.category;
}

function getSessionCategoryDisplayLabel(s: VotingSession): string {
  const detected = detectPresetFromSession(s);
  return FORM_PRESET_META[detected].label;
}

function getDefaultUnitForPreset(
  preset: FormPreset,
  portalSession: AdminSession | BranchSession
): UnitName {
  if (portalSession.type === 'branch') return portalSession.branch;
  if (
    preset === 'multi_branch_4' ||
    preset === 'multi_branch_4_ubkt' ||
    preset === 'collective_party' ||
    preset === 'individual_committee'
  ) {
    return 'Đảng bộ trường';
  }
  if (preset === 'collective_ubkt') {
    return 'UBKT Đảng uỷ';
  }
  return 'Chi bộ 1';
}

function getDefaultTitle(
  preset: FormPreset,
  unitName: UnitName,
  year: number
): string {
  switch (preset) {
    case 'multi_branch_4':
      return `Biểu quyết xếp loại 4 Chi bộ trực thuộc (Tìm Chi bộ xuất sắc nhất) năm ${year}`;
    case 'multi_branch_4_ubkt':
      return `Biểu quyết xếp loại 4 Chi bộ trực thuộc và UBKT Đảng uỷ năm ${year}`;
    case 'collective_branch':
      return `Biểu quyết xếp loại tập thể ${unitName} năm ${year}`;
    case 'collective_party':
      return `Biểu quyết xếp loại tập thể Đảng bộ Trường THPT Thanh Hoà năm ${year}`;
    case 'collective_ubkt':
      return `Biểu quyết xếp loại tập thể UBKT Đảng uỷ năm ${year}`;
    case 'individual_committee':
      return `Biểu quyết xếp loại Đảng uỷ viên và cán bộ lãnh đạo năm ${year}`;
    case 'individual_member':
      return `Biểu quyết xếp loại Đảng viên ${unitName} năm ${year}`;
  }
}

function buildAutoCandidatesAndVoters(
  preset: FormPreset,
  unitName: UnitName,
  dossiers: Dossier[]
): { candidates: VotingCandidate[]; voters: VotingVoter[] } {
  const activeDossiers = dossiers.filter((d) => d.year === DEFAULT_YEAR);
  const allIndividuals = activeDossiers.filter((d) => d.type === 'individual');
  const leaders = allIndividuals.filter(
    (d) => d.positionGroup === 'Giữ chức vụ lãnh đạo, quản lý'
  );

  const toVoter = (d: Dossier): VotingVoter => ({
    id: d.id,
    name: getDossierDisplayName(d),
    branch: d.branch,
  });

  if (preset === 'multi_branch_4' || preset === 'multi_branch_4_ubkt') {
    const branchCandidates: VotingCandidate[] = BRANCH_LIST.map(
      (branchName, idx) => {
        const col = activeDossiers.find(
          (d) => d.type === 'collective' && d.branch === branchName
        );
        const selfRaw =
          col?.branchProposedRating || col?.selfProposedRating || '';
        return {
          id: col?.id ?? `cand_${UNIT_KEY_MAP[branchName]}`,
          dossierId: col?.id,
          stt: idx + 1,
          name: branchName,
          position: '',
          selfRatingShort: selfRaw ? RATING_TO_SHORT[selfRaw] ?? '' : '',
          group: 'branch',
        };
      }
    );

    if (preset === 'multi_branch_4_ubkt') {
      const ubktCol = activeDossiers.find(
        (d) => d.type === 'collective' && d.unitKey === 'ubkt'
      );
      const ubktSelfRaw =
        ubktCol?.branchProposedRating || ubktCol?.selfProposedRating || '';
      branchCandidates.push({
        id: ubktCol?.id ?? 'cand_ubkt',
        dossierId: ubktCol?.id,
        stt: branchCandidates.length + 1,
        name: 'Uỷ ban Kiểm tra Đảng uỷ',
        position: '',
        selfRatingShort: ubktSelfRaw ? RATING_TO_SHORT[ubktSelfRaw] ?? '' : '',
        group: 'ubkt',
      });
    }

    const defaultBchVoters = leaders.length > 0 ? leaders : allIndividuals;
    return {
      candidates: branchCandidates,
      voters: defaultBchVoters.map(toVoter),
    };
  }

  if (preset === 'collective_branch') {
    const branchCollective = activeDossiers.find(
      (d) => d.type === 'collective' && d.branch === unitName
    );
    const branchMembers = allIndividuals.filter((d) => d.branch === unitName);
    const selfRaw =
      branchCollective?.branchProposedRating ||
      branchCollective?.selfProposedRating ||
      '';
    return {
      candidates: [
        {
          id: branchCollective?.id ?? `cand_${UNIT_KEY_MAP[unitName]}`,
          dossierId: branchCollective?.id,
          stt: 1,
          name: unitName,
          position: '',
          selfRatingShort: selfRaw ? RATING_TO_SHORT[selfRaw] ?? '' : '',
        },
      ],
      voters: branchMembers.map(toVoter),
    };
  }

  if (preset === 'collective_party') {
    const partyCollective = activeDossiers.find(
      (d) => d.type === 'collective' && d.unitKey === 'dang-bo'
    );
    const selfRaw =
      partyCollective?.branchProposedRating ||
      partyCollective?.selfProposedRating ||
      '';
    return {
      candidates: [
        {
          id: partyCollective?.id ?? 'cand_dang_bo',
          dossierId: partyCollective?.id,
          stt: 1,
          name: 'Đảng bộ Trường THPT Thanh Hoà',
          position: '',
          selfRatingShort: selfRaw ? RATING_TO_SHORT[selfRaw] ?? '' : '',
        },
      ],
      voters: allIndividuals.map(toVoter),
    };
  }

  if (preset === 'collective_ubkt') {
    const ubktCollective = activeDossiers.find(
      (d) => d.type === 'collective' && d.unitKey === 'ubkt'
    );
    const selfRaw =
      ubktCollective?.branchProposedRating ||
      ubktCollective?.selfProposedRating ||
      '';
    const defaultVoters = leaders.length > 0 ? leaders : allIndividuals;
    return {
      candidates: [
        {
          id: ubktCollective?.id ?? 'cand_ubkt',
          dossierId: ubktCollective?.id,
          stt: 1,
          name: 'Uỷ ban Kiểm tra Đảng uỷ',
          position: '',
          selfRatingShort: selfRaw ? RATING_TO_SHORT[selfRaw] ?? '' : '',
        },
      ],
      voters: defaultVoters.map(toVoter),
    };
  }

  if (preset === 'individual_committee') {
    const source = leaders.length > 0 ? leaders : allIndividuals.slice(0, 7);
    return {
      candidates: source.map((d, idx) => ({
        id: d.id,
        dossierId: d.id,
        stt: idx + 1,
        name: getDossierDisplayName(d),
        position: 'ĐUV',
        selfRatingShort: d.selfProposedRating
          ? RATING_TO_SHORT[d.selfProposedRating] ?? ''
          : '',
      })),
      voters: allIndividuals.map(toVoter),
    };
  }

  // individual_member
  const branchMembers = allIndividuals.filter((d) => d.branch === unitName);
  return {
    candidates: branchMembers.map((d, idx) => ({
      id: d.id,
      dossierId: d.id,
      stt: idx + 1,
      name: getDossierDisplayName(d),
      position:
        d.positionGroup === 'Giữ chức vụ lãnh đạo, quản lý' ? 'CUV' : 'ĐV',
      selfRatingShort: d.selfProposedRating
        ? RATING_TO_SHORT[d.selfProposedRating] ?? ''
        : '',
    })),
    voters: branchMembers.map(toVoter),
  };
}

function getDefaultMeetingDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const VotingManagerPage: React.FC<VotingManagerPageProps> = ({
  session,
  dossiers,
  onSyncRatingsToDossiers,
  onNotify,
}) => {
  const [votingSessions, setVotingSessions] = useState<VotingSession[]>([]);
  const [attendance, setAttendance] = useState<VoterAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [missingTables, setMissingTables] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);
  const [copiedKey, setCopiedKey] = useState('');

  // Selected session & tally
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [tally, setTally] = useState<VotingTallyResult | null>(null);
  const [loadingTally, setLoadingTally] = useState(false);
  const [showAttendanceList, setShowAttendanceList] = useState(true);

  // Create / Edit form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPreset, setFormPreset] = useState<FormPreset>(
    () => getAllowedPresets(session)[0]
  );
  const [formUnitName, setFormUnitName] = useState<UnitName>(() =>
    getDefaultUnitForPreset(getAllowedPresets(session)[0], session)
  );
  const [formTitle, setFormTitle] = useState('');
  const [formMeetingDate, setFormMeetingDate] = useState(getDefaultMeetingDate);
  const [formHtxsnvMode, setFormHtxsnvMode] = useState<HtxsnvMode>('warn');
  const [formMaxPercent, setFormMaxPercent] = useState<number>(20);
  const [formUbktIndependent, setFormUbktIndependent] = useState<boolean>(true);
  const [formCandidates, setFormCandidates] = useState<VotingCandidate[]>([]);
  const [formVoters, setFormVoters] = useState<VotingVoter[]>([]);
  const [newVoterName, setNewVoterName] = useState('');
  const [isSavingForm, setIsSavingForm] = useState(false);

  // Modals
  const [confirmCloseModal, setConfirmCloseModal] = useState(false);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTargetField, setSyncTargetField] = useState<
    'branchProposedRating' | 'officialRating'
  >(session.type === 'admin' ? 'officialRating' : 'branchProposedRating');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const allowedPresets = useMemo(() => getAllowedPresets(session), [session]);

  // Subscribe Realtime to Supabase voting tables
  useEffect(() => {
    setIsLoading(true);
    const unsub = subscribeVotingRealtime(
      (list, att) => {
        setVotingSessions(list);
        setAttendance(att);
        setMissingTables(false);
        setIsLoading(false);
      },
      (err) => {
        setIsLoading(false);
        if (isMissingVotingTableError(err)) {
          setMissingTables(true);
          return;
        }
        onNotify(
          'error',
          'Không thể đồng bộ dữ liệu phiên bỏ phiếu từ Supabase.'
        );
      }
    );
    return () => unsub();
  }, [onNotify, retryCounter]);

  // Filter sessions visible to this host
  const scopedSessions = useMemo(() => {
    if (session.type === 'admin') return votingSessions;
    return votingSessions.filter((s) => s.unitKey === session.unitKey);
  }, [votingSessions, session]);

  // Auto-select first session if none selected
  useEffect(() => {
    if (scopedSessions.length === 0) {
      setSelectedSessionId('');
      return;
    }
    if (
      !selectedSessionId ||
      !scopedSessions.some((s) => s.id === selectedSessionId)
    ) {
      setSelectedSessionId(scopedSessions[0].id);
    }
  }, [scopedSessions, selectedSessionId]);

  const selectedSession = useMemo(
    () => scopedSessions.find((s) => s.id === selectedSessionId) ?? null,
    [scopedSessions, selectedSessionId]
  );

  const selectedAttendance = useMemo(
    () =>
      selectedSession
        ? attendance.filter((a) => a.sessionId === selectedSession.id)
        : [],
    [attendance, selectedSession]
  );

  const loadTallyForSelected = useCallback(async () => {
    if (!selectedSession) {
      setTally(null);
      return;
    }
    setLoadingTally(true);
    try {
      const res = await fetchVotingTally(selectedSession.id);
      setTally(res);
    } catch {
      setTally(null);
    } finally {
      setLoadingTally(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    void loadTallyForSelected();
  }, [loadTallyForSelected, selectedAttendance.length, selectedSession?.status]);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const generalVotingUrl = `${baseUrl}?cong=bo-phieu`;

  const copyText = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotify('success', `Đã sao chép ${label}.`);
      window.setTimeout(() => setCopiedKey(''), 2500);
    } catch {
      onNotify('error', 'Trình duyệt chặn sao chép tự động. Vui lòng sao chép thủ công.');
    }
  };

  const applyPresetDefaults = (preset: FormPreset) => {
    if (preset === 'multi_branch_4') {
      setFormHtxsnvMode('strict');
      setFormMaxPercent(20);
      setFormUbktIndependent(false);
    } else if (preset === 'multi_branch_4_ubkt') {
      setFormHtxsnvMode('strict');
      setFormMaxPercent(40);
      setFormUbktIndependent(true);
    } else if (FORM_PRESET_META[preset].template === 'mau5') {
      setFormHtxsnvMode('warn');
      setFormMaxPercent(20);
      setFormUbktIndependent(false);
    } else {
      setFormHtxsnvMode('off');
      setFormMaxPercent(20);
      setFormUbktIndependent(false);
    }
  };

  // Open Create Form
  const openCreateForm = () => {
    const preset = allowedPresets[0];
    const unit = getDefaultUnitForPreset(preset, session);
    const auto = buildAutoCandidatesAndVoters(preset, unit, dossiers);
    setEditingId(null);
    setFormPreset(preset);
    setFormUnitName(unit);
    setFormTitle(getDefaultTitle(preset, unit, DEFAULT_YEAR));
    setFormMeetingDate(getDefaultMeetingDate());
    applyPresetDefaults(preset);
    setFormCandidates(auto.candidates);
    setFormVoters(auto.voters);
    setNewVoterName('');
    setIsFormOpen(true);
  };

  // Open Edit Form for draft session
  const openEditForm = (s: VotingSession) => {
    const detected = detectPresetFromSession(s);
    setEditingId(s.id);
    setFormPreset(detected);
    setFormUnitName(s.unitName);
    setFormTitle(s.title);
    setFormMeetingDate(s.meetingDate || getDefaultMeetingDate());
    setFormHtxsnvMode(s.htxsnvMode);
    setFormMaxPercent(s.maxHtxsnvPercent);
    setFormUbktIndependent(hasIndependentUbktRule(s));
    setFormCandidates(s.candidates.map((c) => ({ ...c })));
    setFormVoters(s.eligibleVoters.map((v) => ({ ...v })));
    setNewVoterName('');
    setIsFormOpen(true);
  };

  const handlePresetChange = (preset: FormPreset) => {
    setFormPreset(preset);
    const nextUnit = getDefaultUnitForPreset(preset, session);
    setFormUnitName(nextUnit);
    if (!editingId) {
      const auto = buildAutoCandidatesAndVoters(preset, nextUnit, dossiers);
      setFormTitle(getDefaultTitle(preset, nextUnit, DEFAULT_YEAR));
      setFormCandidates(auto.candidates);
      setFormVoters(auto.voters);
      applyPresetDefaults(preset);
    }
  };

  const handleUnitChange = (unit: UnitName) => {
    setFormUnitName(unit);
    if (!editingId) {
      const auto = buildAutoCandidatesAndVoters(formPreset, unit, dossiers);
      setFormTitle(getDefaultTitle(formPreset, unit, DEFAULT_YEAR));
      setFormCandidates(auto.candidates);
      setFormVoters(auto.voters);
    }
  };

  const handleLoadVoterPreset = (
    preset: 'unit' | 'all_party' | 'leaders'
  ) => {
    const activeInd = dossiers.filter(
      (d) => d.year === DEFAULT_YEAR && d.type === 'individual'
    );
    let filtered = activeInd;
    if (preset === 'unit') {
      filtered = activeInd.filter((d) => d.branch === formUnitName);
      if (filtered.length === 0) filtered = activeInd;
    } else if (preset === 'leaders') {
      filtered = activeInd.filter(
        (d) => d.positionGroup === 'Giữ chức vụ lãnh đạo, quản lý'
      );
    }
    setFormVoters(
      filtered.map((d) => ({
        id: d.id,
        name: getDossierDisplayName(d),
        branch: d.branch,
      }))
    );
  };

  const handleAddCandidate = () => {
    const id = `cand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setFormCandidates((prev) => [
      ...prev,
      {
        id,
        stt: prev.length + 1,
        name: '',
        position:
          FORM_PRESET_META[formPreset].template === 'mau5' ? 'ĐV' : '',
        selfRatingShort: '',
        ...(isMultiBranchPreset(formPreset) ? { group: 'branch' as const } : {}),
      },
    ]);
  };

  const handleAddCustomVoter = () => {
    const clean = newVoterName.trim();
    if (!clean) return;
    setFormVoters((prev) => [
      ...prev,
      {
        id: `voter_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        branch: formUnitName,
      },
    ]);
    setNewVoterName('');
  };

  const persistVotingSession = async (target: VotingSession) => {
    if (session.type === 'admin') {
      await saveVotingSessionAsAdmin(target);
    } else {
      await saveVotingSessionAsBranch(target, session.branchProof);
    }
  };

  const handleSaveForm = async (openImmediately: boolean) => {
    const cleanTitle = formTitle.trim();
    if (!cleanTitle) {
      onNotify('error', 'Vui lòng nhập tiêu đề phiên bỏ phiếu.');
      return;
    }
    const validCandidates: VotingCandidate[] = formCandidates
      .map((c) => ({ ...c, name: c.name.trim(), position: c.position ?? '' }))
      .filter((c) => c.name.length > 0)
      .map((c, idx) => ({ ...c, stt: idx + 1 }));
    if (validCandidates.length === 0) {
      onNotify(
        'error',
        'Cần có ít nhất 1 đối tượng (tập thể hoặc cá nhân) trong phiếu biểu quyết.'
      );
      return;
    }
    if (formVoters.length === 0) {
      onNotify(
        'error',
        'Cần có ít nhất 1 cử tri trong danh sách tham gia bỏ phiếu.'
      );
      return;
    }

    const presetMeta = FORM_PRESET_META[formPreset];
    const hasBranchAndUbkt =
      validCandidates.some((c) => c.group === 'branch') &&
      validCandidates.some((c) => c.group === 'ubkt');

    let effectiveMaxPercent = Math.max(
      1,
      Math.min(100, Number(formMaxPercent) || 20)
    );
    if (hasBranchAndUbkt && formHtxsnvMode !== 'off') {
      effectiveMaxPercent = formUbktIndependent ? 40 : 20;
    }

    const newId =
      editingId ??
      `vote_${UNIT_KEY_MAP[formUnitName]}_${Date.now().toString(36)}`;
    const payload: VotingSession = {
      id: newId,
      title: cleanTitle,
      template: presetMeta.template,
      category: presetMeta.dbCategory,
      unitKey: UNIT_KEY_MAP[formUnitName],
      unitName: formUnitName,
      year: DEFAULT_YEAR,
      meetingDate: formMeetingDate,
      status: openImmediately ? 'open' : 'draft',
      htxsnvMode: formHtxsnvMode,
      maxHtxsnvPercent: effectiveMaxPercent,
      candidates: validCandidates,
      eligibleVoters: formVoters,
      createdBy:
        session.type === 'admin' ? session.displayName : session.branch,
      createdAt: new Date().toISOString(),
      closedAt: null,
    };

    setIsSavingForm(true);
    try {
      await persistVotingSession(payload);
      setIsFormOpen(false);
      setSelectedSessionId(payload.id);
      onNotify(
        'success',
        openImmediately
          ? 'Đã tạo và mở hòm phiếu trực tuyến thành công! Có thể gửi link cho cử tri bỏ phiếu ngay.'
          : 'Đã lưu phiên bỏ phiếu ở trạng thái Nháp.'
      );
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Không thể lưu phiên bỏ phiếu lên Supabase.';
      onNotify('error', msg);
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleChangeStatus = async (newStatus: 'open' | 'closed') => {
    if (!selectedSession) return;
    setIsMutating(true);
    try {
      const updated: VotingSession = {
        ...selectedSession,
        status: newStatus,
        closedAt: newStatus === 'closed' ? new Date().toISOString() : null,
      };
      await persistVotingSession(updated);
      setConfirmCloseModal(false);
      onNotify(
        'success',
        newStatus === 'open'
          ? 'Đã mở hòm phiếu! Cử tri có thể chọn tên và bỏ phiếu ngay.'
          : 'Đã chốt phiên và công bố kết quả kiểm phiếu chính thức!'
      );
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Không thể cập nhật trạng thái phiên bỏ phiếu.';
      onNotify('error', msg);
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    setIsMutating(true);
    try {
      if (session.type === 'admin') {
        await deleteVotingSessionAsAdmin(selectedSession.id);
      } else {
        await deleteVotingSessionAsBranch(
          selectedSession.id,
          selectedSession.unitKey,
          session.branchProof
        );
      }
      setConfirmDeleteModal(false);
      setSelectedSessionId('');
      onNotify('success', 'Đã xoá phiên bỏ phiếu khỏi hệ thống.');
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Không thể xoá phiên bỏ phiếu.';
      onNotify('error', msg);
    } finally {
      setIsMutating(false);
    }
  };

  const syncableUpdates = useMemo<VotingSyncUpdate[]>(() => {
    if (!selectedSession || !tally || selectedSession.status !== 'closed') {
      return [];
    }
    const list: VotingSyncUpdate[] = [];
    for (const cand of selectedSession.candidates) {
      if (!cand.dossierId) continue;
      const majority = getMajorityRating(
        tally.tallies[cand.id],
        tally.totalBallots
      );
      if (!majority) continue;
      const fullRating = SHORT_TO_RATING[majority];
      if (!fullRating) continue;
      list.push({
        dossierId: cand.dossierId,
        rating: fullRating,
        targetField:
          session.type === 'admin' ? syncTargetField : 'branchProposedRating',
        sessionTitle: selectedSession.title,
      });
    }
    return list;
  }, [selectedSession, tally, session.type, syncTargetField]);

  const handleExecuteSync = async () => {
    if (syncableUpdates.length === 0) return;
    setIsSyncing(true);
    try {
      await onSyncRatingsToDossiers(syncableUpdates);
      setShowSyncModal(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (!selectedSession || !tally) return;
    const fileName = exportVotingResultToExcel(
      selectedSession,
      tally,
      selectedAttendance.length
    );
    onNotify('success', `Đã xuất tệp Excel kiểm phiếu: ${fileName}`);
  };

  // SQL Setup Guard Screen if voting tables aren't created yet on Supabase
  if (missingTables) {
    return (
      <div className="space-y-5">
        <div className="pb-3 border-b-2 border-[#8E1018]">
          <h2 className="text-2xl font-bold text-[#8E1018] m-0">
            Bỏ phiếu kín trực tuyến (Mẫu 4 &amp; Mẫu 5)
          </h2>
          <p className="text-[15px] text-[#594446] mt-1 mb-0">
            Tổ chức biểu quyết xếp loại tập thể (Chi bộ, Đảng bộ trường, UBKT) và cá nhân (Đảng uỷ viên, Đảng viên)
          </p>
        </div>

        <div className="bg-[#FCF8E8] border-2 border-[#8E1018] p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#8E1018] font-bold text-lg">
            <Database className="w-6 h-6 shrink-0" />
            <span>
              Khởi tạo bảng Bỏ phiếu kín trên Supabase (chỉ làm 1 lần duy nhất)
            </span>
          </div>
          <p className="text-[15px] text-[#3d2817] m-0 leading-relaxed">
            Để kích hoạt tính năng <strong>Bỏ phiếu kín trực tuyến Mẫu 4 &amp; Mẫu 5</strong> (tách biệt danh sách điểm danh cử tri và hòm phiếu ẩn danh không lưu tên người bỏ phiếu), vui lòng bấm nút dưới đây để sao chép mã SQL, dán vào{' '}
            <strong>Supabase → SQL Editor → New query</strong> và bấm{' '}
            <strong>Run</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() =>
                void copyText(
                  'voting_sql',
                  SUPABASE_VOTING_SQL,
                  'mã SQL khởi tạo Bỏ phiếu trực tuyến'
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#8E1018] text-white font-bold text-sm hover:bg-[#730B12]"
            >
              {copiedKey === 'voting_sql' ? (
                <>
                  <Check className="w-4 h-4 text-[#F6CF62]" />
                  Đã sao chép mã SQL Bỏ phiếu
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-4 h-4 text-[#F6CF62]" />
                  Sao chép mã SQL khởi tạo Bỏ phiếu
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setRetryCounter((c) => c + 1)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-sm hover:bg-[#FBF0C9]"
            >
              <RefreshCw className="w-4 h-4" />
              Đã chạy SQL – Kiểm tra lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  const votedIdsSet = new Set(selectedAttendance.map((a) => a.voterId));
  const eligibleCount = selectedSession?.eligibleVoters.length ?? 0;
  const votedCount = selectedAttendance.length;
  const progressPct =
    eligibleCount > 0 ? Math.min(100, Math.round((votedCount / eligibleCount) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-3 border-b-2 border-[#8E1018] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#8E1018] m-0 flex items-center gap-2">
            <Vote className="w-6 h-6 shrink-0" />
            <span>Bỏ phiếu kín trực tuyến (Mẫu 4 &amp; Mẫu 5)</span>
          </h2>
          <p className="text-[15px] text-[#594446] mt-1 mb-0">
            Tổ chức biểu quyết kín, theo dõi tiến độ điểm danh cử tri theo thời gian thực, kiểm phiếu tự động và đồng bộ kết quả về Hồ sơ kiểm điểm.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void copyText(
                'general_vote_url',
                generalVotingUrl,
                'đường link Cổng Bỏ phiếu trực tuyến'
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-sm hover:bg-[#FBF0C9]"
          >
            {copiedKey === 'general_vote_url' ? (
              <>
                <Check className="w-4 h-4" />
                Đã sao chép link Bỏ phiếu
              </>
            ) : (
              <>
                <ClipboardCopy className="w-4 h-4" />
                Sao chép link Cổng Bỏ phiếu
              </>
            )}
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#8E1018] text-white font-bold text-sm hover:bg-[#730B12]"
          >
            <Plus className="w-4 h-4 text-[#F6CF62]" />
            Tạo phiên bỏ phiếu mới
          </button>
        </div>
      </div>

      {/* CREATE / EDIT SESSION FORM */}
      {isFormOpen && (
        <section className="bg-white border-2 border-[#8E1018] shadow-md">
          <div className="bg-[#8E1018] text-white px-5 py-3 border-b-2 border-[#F6CF62] flex items-center justify-between">
            <div className="font-bold text-base">
              {editingId
                ? 'Chỉnh sửa phiên bỏ phiếu (Nháp)'
                : 'Khởi tạo phiên bỏ phiếu trực tuyến mới'}
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs font-bold text-[#F6CF62] underline hover:text-white"
            >
              Đóng biểu mẫu
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Step 1: Category / Preset & Unit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[#6b0b12] mb-1.5">
                  1. Chọn loại phiên biểu quyết (Mẫu 4 / Mẫu 5)
                </label>
                <select
                  value={formPreset}
                  onChange={(e) =>
                    handlePresetChange(e.target.value as FormPreset)
                  }
                  disabled={Boolean(editingId)}
                  className="w-full px-3 py-2 border border-[#8E1018] bg-white text-[15px] font-bold disabled:bg-[#f4eee9]"
                >
                  {allowedPresets.map((preset) => (
                    <option key={preset} value={preset}>
                      {FORM_PRESET_META[preset].label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[#5c4748] mt-1 mb-0">
                  {FORM_PRESET_META[formPreset].description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#6b0b12] mb-1.5">
                  2. Đơn vị tổ chức
                </label>
                {session.type === 'branch' ||
                isMultiBranchPreset(formPreset) ||
                formPreset === 'collective_party' ||
                formPreset === 'collective_ubkt' ||
                formPreset === 'individual_committee' ? (
                  <input
                    type="text"
                    readOnly
                    value={formUnitName}
                    className="w-full px-3 py-2 border border-[#d5969a] bg-[#FAF8F3] text-[15px] font-bold text-[#6b0b12]"
                  />
                ) : (
                  <select
                    value={formUnitName}
                    onChange={(e) =>
                      handleUnitChange(e.target.value as UnitName)
                    }
                    className="w-full px-3 py-2 border border-[#8E1018] bg-white text-[15px] font-bold"
                  >
                    {(formPreset === 'collective_branch' ||
                    formPreset === 'individual_member'
                      ? BRANCH_LIST
                      : ALL_UNITS
                    ).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Step 2: Title, Date, 20% Rule */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <label className="block text-sm font-bold text-[#6b0b12] mb-1">
                  Tiêu đề phiên bỏ phiếu
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="VD: Biểu quyết xếp loại 4 Chi bộ trực thuộc năm 2026"
                  className="w-full px-3 py-2 border border-[#b8424a] bg-white text-[15px]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-[#6b0b12] mb-1">
                  Ngày họp
                </label>
                <input
                  type="date"
                  value={formMeetingDate}
                  onChange={(e) => setFormMeetingDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-[#b8424a] bg-white text-[14px]"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-bold text-[#6b0b12] mb-1">
                  Quy định tỷ lệ HTXSNV
                </label>
                <select
                  value={formHtxsnvMode}
                  onChange={(e) =>
                    setFormHtxsnvMode(e.target.value as HtxsnvMode)
                  }
                  className="w-full px-2.5 py-2 border border-[#b8424a] bg-white text-[14px]"
                >
                  <option value="warn">Nhắc nhở nhẹ (Khuyên dùng)</option>
                  <option value="strict">Chặn cứng tối đa theo quy định</option>
                  <option value="off">Không giới hạn</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-[#6b0b12] mb-1">
                  Mức trần (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={
                    formHtxsnvMode === 'off' ||
                    (formPreset === 'multi_branch_4_ubkt' &&
                      formCandidates.some((c) => c.group === 'ubkt'))
                  }
                  value={formMaxPercent}
                  onChange={(e) =>
                    setFormMaxPercent(Number(e.target.value) || 20)
                  }
                  className="w-full px-2.5 py-2 border border-[#b8424a] bg-white text-[14px] disabled:bg-[#f4eee9]"
                />
              </div>
            </div>

            {/* Special Rule Box for Combined 4 Chi bộ / 4 Chi bộ + UBKT */}
            {isMultiBranchPreset(formPreset) && (
              <div className="bg-[#FDF6DE] border border-[#C8941A] p-3.5 space-y-2 text-sm text-[#4b3512]">
                <div className="font-bold text-[#8E1018] flex items-center gap-1.5">
                  <Award className="w-4 h-4 shrink-0" />
                  <span>
                    Cơ chế bỏ phiếu gộp tìm Chi bộ Hoàn thành xuất sắc nhiệm vụ
                  </span>
                </div>
                <p className="m-0 text-xs leading-relaxed">
                  Mỗi đồng chí Đảng uỷ viên bỏ phiếu đánh giá tất cả tập thể trong{' '}
                  <strong>01 phiếu Mẫu 4 duy nhất</strong>. Với 4 Chi bộ trực thuộc, tỷ lệ tối đa 20% tương ứng{' '}
                  <strong>tối đa 01 Chi bộ được chọn mức HTXSNV</strong> trên mỗi lá phiếu. Khi chốt phiên, hệ thống tự động xếp hạng 4 Chi bộ theo số phiếu HTXSNV (cảnh báo nếu bằng phiếu hoặc chưa quá bán).
                </p>
                {(formPreset === 'multi_branch_4_ubkt' ||
                  formCandidates.some((c) => c.group === 'ubkt')) &&
                  formHtxsnvMode !== 'off' && (
                    <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formUbktIndependent}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormUbktIndependent(checked);
                          setFormMaxPercent(checked ? 40 : 20);
                        }}
                        className="mt-0.5 accent-[#8E1018] w-4 h-4"
                      />
                      <span className="text-xs font-bold text-[#261617]">
                        Chỉ giới hạn tối đa 01 HTXSNV trong nhóm 4 Chi bộ — đánh giá UBKT Đảng uỷ độc lập (khuyên dùng).
                        <span className="block font-normal text-[#5c4748]">
                          Nếu bỏ chọn, cả 5 tập thể (4 Chi bộ + UBKT) sẽ dùng chung giới hạn tối đa 01 mức HTXSNV trên toàn phiếu.
                        </span>
                      </span>
                    </label>
                  )}
              </div>
            )}

            {/* Step 3: Candidates Editor */}
            <div className="border border-[#d5969a] p-4 bg-[#FAF8F3] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-[#6b0b12] m-0">
                    3. Danh sách đối tượng trên phiếu (
                    {FORM_PRESET_META[formPreset].template === 'mau4'
                      ? 'Mẫu 4 – Tập thể'
                      : 'Mẫu 5 – Cá nhân'}
                    ) — {formCandidates.length} dòng
                  </h4>
                  <p className="text-xs text-[#5c4748] m-0">
                    Tự động nạp từ danh sách hồ sơ năm {DEFAULT_YEAR}. Có thể chỉnh sửa tên, mức tự nhận hoặc thêm/bớt dòng.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddCandidate}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-xs hover:bg-[#FBF0C9]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm dòng
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="party-table text-[14px]">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">STT</th>
                      <th className="min-w-[220px]">
                        {FORM_PRESET_META[formPreset].template === 'mau4'
                          ? 'Tên tổ chức đảng, tập thể'
                          : 'Họ và tên'}
                      </th>
                      {isMultiBranchPreset(formPreset) && (
                        <th className="w-44">Nhóm xếp hạng</th>
                      )}
                      {FORM_PRESET_META[formPreset].template === 'mau5' && (
                        <th className="w-36">Chức vụ</th>
                      )}
                      <th className="w-40">Tự nhận mức</th>
                      <th className="w-16 text-center">Xoá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formCandidates.map((cand, idx) => (
                      <tr key={cand.id}>
                        <td className="text-center font-bold tabular-nums">
                          {idx + 1}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cand.name}
                            onChange={(e) =>
                              setFormCandidates((prev) =>
                                prev.map((item) =>
                                  item.id === cand.id
                                    ? { ...item, name: e.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="Nhập tên..."
                            className="w-full px-2 py-1 border border-[#d5969a] bg-white text-[14px] font-bold"
                          />
                        </td>
                        {isMultiBranchPreset(formPreset) && (
                          <td>
                            <select
                              value={cand.group ?? 'branch'}
                              onChange={(e) =>
                                setFormCandidates((prev) =>
                                  prev.map((item) =>
                                    item.id === cand.id
                                      ? {
                                          ...item,
                                          group: e.target.value as
                                            | 'branch'
                                            | 'ubkt',
                                        }
                                      : item
                                  )
                                )
                              }
                              className="w-full px-2 py-1 border border-[#d5969a] bg-white text-[13px] font-bold"
                            >
                              <option value="branch">Nhóm 4 Chi bộ</option>
                              <option value="ubkt">UBKT (Độc lập)</option>
                            </select>
                          </td>
                        )}
                        {FORM_PRESET_META[formPreset].template === 'mau5' && (
                          <td>
                            <input
                              type="text"
                              value={cand.position ?? ''}
                              onChange={(e) =>
                                setFormCandidates((prev) =>
                                  prev.map((item) =>
                                    item.id === cand.id
                                      ? { ...item, position: e.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="VD: ĐUV-BTCB, ĐV"
                              className="w-full px-2 py-1 border border-[#d5969a] bg-white text-[14px]"
                            />
                          </td>
                        )}
                        <td>
                          <select
                            value={cand.selfRatingShort}
                            onChange={(e) =>
                              setFormCandidates((prev) =>
                                prev.map((item) =>
                                  item.id === cand.id
                                    ? {
                                        ...item,
                                        selfRatingShort: e.target.value as
                                          | ShortRating
                                          | '',
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-full px-2 py-1 border border-[#d5969a] bg-white text-[14px] font-bold"
                          >
                            <option value="">— Chưa chọn —</option>
                            {SHORT_RATING_OPTIONS.map((opt) => (
                              <option key={opt.code} value={opt.code}>
                                {opt.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setFormCandidates((prev) =>
                                prev.filter((item) => item.id !== cand.id)
                              )
                            }
                            className="p-1 text-[#8E1018] hover:bg-[#FDF1F2]"
                            aria-label={`Xoá ${cand.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 4: Eligible Voters Editor */}
            <div className="border border-[#d5969a] p-4 bg-[#FAF8F3] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-[#6b0b12] m-0">
                    4. Danh sách cử tri được quyền bỏ phiếu ({formVoters.length}{' '}
                    đồng chí)
                  </h4>
                  <p className="text-xs text-[#5c4748] m-0">
                    Cử tri mở link và chọn đúng tên mình trong danh sách này để vào bỏ phiếu kín (không cần mật khẩu/mã phòng). Có thể gạch bớt đảng viên vắng mặt hoặc thêm cử tri.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLoadVoterPreset('unit')}
                    className="px-2.5 py-1 bg-white border border-[#b8424a] text-[#6b0b12] text-xs font-bold hover:bg-[#FBF0C9]"
                  >
                    Nạp đảng viên {formUnitName}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadVoterPreset('leaders')}
                    className="px-2.5 py-1 bg-white border border-[#b8424a] text-[#6b0b12] text-xs font-bold hover:bg-[#FBF0C9]"
                  >
                    Nạp nhóm Lãnh đạo/ĐUV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadVoterPreset('all_party')}
                    className="px-2.5 py-1 bg-white border border-[#b8424a] text-[#6b0b12] text-xs font-bold hover:bg-[#FBF0C9]"
                  >
                    Nạp toàn Đảng bộ
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newVoterName}
                  onChange={(e) => setNewVoterName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomVoter();
                    }
                  }}
                  placeholder="Thêm nhanh tên cử tri (VD: Nguyễn Văn A)..."
                  className="flex-1 min-w-[220px] px-3 py-1.5 border border-[#b8424a] bg-white text-[14px]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomVoter}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#8E1018] text-white font-bold text-xs hover:bg-[#730B12]"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#F6CF62]" />
                  Thêm cử tri
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto border border-[#e3c8c9] bg-white divide-y divide-[#f2e2e3]">
                {formVoters.length === 0 ? (
                  <div className="p-4 text-center text-sm text-[#6b0b12]">
                    Chưa có cử tri nào trong danh sách.
                  </div>
                ) : (
                  formVoters.map((v, idx) => (
                    <div
                      key={v.id}
                      className="px-3 py-1.5 flex items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        <strong className="tabular-nums mr-2 text-[#8E1018]">
                          {idx + 1}.
                        </strong>
                        <span className="font-bold">{v.name}</span>
                        {v.branch && (
                          <span className="text-xs text-[#665052] ml-2">
                            ({v.branch})
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormVoters((prev) =>
                            prev.filter((item) => item.id !== v.id)
                          )
                        }
                        className="text-xs font-bold text-[#8E1018] hover:underline"
                      >
                        Bỏ ra
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Form Submit Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#e3c8c9]">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={isSavingForm}
                className="px-4 py-2 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-sm hover:bg-[#FBF0C9]"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={() => void handleSaveForm(false)}
                disabled={isSavingForm}
                className="px-4 py-2 bg-[#F6CF62] text-[#8E1018] border border-[#8E1018] font-bold text-sm hover:bg-[#f2c444] disabled:opacity-50"
              >
                {isSavingForm ? 'Đang lưu...' : 'Lưu nháp (Chưa mở)'}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveForm(true)}
                disabled={isSavingForm}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#8E1018] text-white font-bold text-sm hover:bg-[#730B12] disabled:opacity-50"
              >
                <Play className="w-4 h-4 text-[#F6CF62]" />
                {isSavingForm ? 'Đang lưu...' : 'Lưu & Mở hòm phiếu ngay'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE: Session List + Selected Session Control */}
      {isLoading ? (
        <div className="py-12 text-center text-[#8E1018] font-bold">
          Đang tải danh sách phiên bỏ phiếu từ Supabase...
        </div>
      ) : scopedSessions.length === 0 ? (
        <div className="bg-white border border-[#b8424a] p-8 text-center space-y-3">
          <Vote className="w-10 h-10 text-[#8E1018] mx-auto" />
          <div className="text-lg font-bold text-[#6b0b12]">
            Chưa có phiên bỏ phiếu nào được tạo
          </div>
          <p className="text-[15px] text-[#594446] max-w-xl mx-auto m-0">
            Bấm nút <strong>“Tạo phiên bỏ phiếu mới”</strong> ở góc trên bên phải để lập phiếu biểu quyết <strong>Mẫu 4</strong> (tập thể) hoặc <strong>Mẫu 5</strong> (đảng viên / Đảng uỷ viên).
          </p>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#8E1018] text-white font-bold text-sm hover:bg-[#730B12]"
          >
            <Plus className="w-4 h-4 text-[#F6CF62]" />
            Tạo phiên bỏ phiếu đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left Column: Session List */}
          <div className="xl:col-span-4 bg-white border border-[#b8424a]">
            <div className="bg-[#FBF0C9] px-4 py-2.5 border-b border-[#b8424a] font-bold text-[#6b0b12] text-sm flex items-center justify-between">
              <span>Danh sách phiên ({scopedSessions.length})</span>
              <span className="text-xs font-normal text-[#5c4748]">
                Cập nhật trực tiếp
              </span>
            </div>
            <div className="divide-y divide-[#e8cfd1] max-h-[680px] overflow-y-auto">
              {scopedSessions.map((s) => {
                const count = attendance.filter(
                  (a) => a.sessionId === s.id
                ).length;
                const isSelected = s.id === selectedSession?.id;
                const statusBadge =
                  s.status === 'open'
                    ? {
                        text: 'Đang mở hòm phiếu',
                        cls: 'bg-[#1D6B3E] text-white',
                      }
                    : s.status === 'closed'
                      ? {
                          text: 'Đã chốt kiểm phiếu',
                          cls: 'bg-[#8E1018] text-[#F6CF62]',
                        }
                      : {
                          text: 'Bản nháp',
                          cls: 'bg-[#FBF0C9] text-[#6b0b12] border border-[#b8424a]',
                        };

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-[#FDF6DE] border-l-4 border-l-[#8E1018]'
                        : 'bg-white hover:bg-[#FAF8F3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-[#8E1018] uppercase">
                        {isMultiBranchCollectiveSession(s)
                          ? s.candidates.some((c) => c.group === 'ubkt')
                            ? 'Mẫu 4 (4 Chi bộ + UBKT)'
                            : 'Mẫu 4 (Gộp 4 Chi bộ)'
                          : s.template === 'mau4'
                            ? 'Mẫu 4'
                            : 'Mẫu 5'}{' '}
                        · {s.unitName}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 whitespace-nowrap ${statusBadge.cls}`}
                      >
                        {statusBadge.text}
                      </span>
                    </div>
                    <div className="font-bold text-[15px] text-[#261617] leading-snug">
                      {s.title}
                    </div>
                    <div className="mt-1.5 text-xs text-[#5c4748] flex items-center justify-between">
                      <span>{s.candidates.length} đối tượng</span>
                      <span className="font-bold tabular-nums text-[#6b0b12]">
                        {count}/{s.eligibleVoters.length} đã bỏ phiếu
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Session Control Panel */}
          {selectedSession && (
            <div className="xl:col-span-8 space-y-5">
              {/* Session Control Header Card */}
              <div className="bg-white border-2 border-[#8E1018] shadow-sm">
                <div className="bg-[#FDF6DE] px-5 py-4 border-b border-[#b8424a] flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[#8E1018] uppercase">
                      {getSessionCategoryDisplayLabel(selectedSession)} ·{' '}
                      {selectedSession.unitName}
                    </div>
                    <h3 className="text-xl font-bold text-[#261617] mt-0.5 mb-1">
                      {selectedSession.title}
                    </h3>
                    <div className="text-xs text-[#594446] flex flex-wrap gap-x-4 gap-y-1">
                      <span>Ngày họp: {selectedSession.meetingDate || '—'}</span>
                      <span>
                        Đối tượng biểu quyết: {selectedSession.candidates.length}
                      </span>
                      <span>
                        Tỷ lệ HTXSNV:{' '}
                        {selectedSession.htxsnvMode === 'off'
                          ? 'Không giới hạn'
                          : hasIndependentUbktRule(selectedSession)
                            ? `${
                                selectedSession.htxsnvMode === 'strict'
                                  ? 'Chặn cứng'
                                  : 'Nhắc nhở'
                              } tối đa 01/04 Chi bộ HTXSNV · UBKT đánh giá độc lập`
                            : isMultiBranchCollectiveSession(selectedSession)
                              ? `${
                                  selectedSession.htxsnvMode === 'strict'
                                    ? 'Chặn cứng'
                                    : 'Nhắc nhở'
                                } tối đa 01 tập thể HTXSNV (≤ ${selectedSession.maxHtxsnvPercent}%)`
                              : selectedSession.htxsnvMode === 'strict'
                                ? `Chặn cứng ≤ ${selectedSession.maxHtxsnvPercent}%`
                                : `Nhắc nhở ≤ ${selectedSession.maxHtxsnvPercent}%`}
                      </span>
                    </div>
                  </div>

                  {/* Lifecycle Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedSession.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditForm(selectedSession)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-xs hover:bg-[#FBF0C9]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Sửa nháp
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleChangeStatus('open')}
                          disabled={isMutating}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#1D6B3E] text-white font-bold text-xs hover:bg-[#15522F] disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Mở hòm phiếu
                        </button>
                      </>
                    )}

                    {selectedSession.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => setConfirmCloseModal(true)}
                        disabled={isMutating}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#8E1018] text-white font-bold text-sm hover:bg-[#730B12] disabled:opacity-50"
                      >
                        <Lock className="w-4 h-4 text-[#F6CF62]" />
                        Chốt phiên &amp; Công bố kết quả
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowPrintModal(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold text-xs hover:bg-[#FBF0C9]"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {selectedSession.status === 'closed'
                        ? 'In Biên bản / Phiếu'
                        : 'In phiếu trống'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#b8424a] text-[#8E1018] font-bold text-xs hover:bg-[#FDF1F2]"
                      title="Xoá phiên bỏ phiếu này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xoá
                    </button>
                  </div>
                </div>

                {/* Direct Link Box & Attendance Progress */}
                <div className="p-5 space-y-4">
                  {/* Direct Voting Link for Zalo */}
                  <div className="bg-[#FAF8F3] border border-[#d5969a] p-3.5 space-y-1.5">
                    <div className="text-xs font-bold text-[#6b0b12]">
                      Đường link trực tiếp phiên này (Gửi nhóm Zalo Chi bộ / Đảng bộ — Cử tri bấm vào, chọn tên là bỏ phiếu kín ngay):
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${baseUrl}?cong=bo-phieu&phien=${selectedSession.id}`}
                        onFocus={(e) => e.target.select()}
                        className="flex-1 px-3 py-1.5 bg-white border border-[#b8424a] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            `link_${selectedSession.id}`,
                            `${baseUrl}?cong=bo-phieu&phien=${selectedSession.id}`,
                            'đường link bỏ phiếu trực tiếp của phiên'
                          )
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-[#8E1018] text-white font-bold text-xs hover:bg-[#730B12] whitespace-nowrap"
                      >
                        {copiedKey === `link_${selectedSession.id}` ? (
                          <>
                            <Check className="w-4 h-4 text-[#F6CF62]" />
                            Đã sao chép
                          </>
                        ) : (
                          <>
                            <ClipboardCopy className="w-4 h-4 text-[#F6CF62]" />
                            Sao chép link gửi Zalo
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Live Attendance Progress */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-bold text-[#6b0b12] flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-[#8E1018]" />
                        Tiến độ bỏ phiếu:{' '}
                        <span className="text-[#8E1018] tabular-nums">
                          {votedCount} / {eligibleCount} đồng chí ({progressPct}%)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAttendanceList((v) => !v)}
                        className="text-xs font-bold text-[#8E1018] underline"
                      >
                        {showAttendanceList
                          ? 'Thu gọn danh sách điểm danh'
                          : 'Xem danh sách ai đã / chưa bỏ phiếu'}
                      </button>
                    </div>

                    <div className="w-full h-3 bg-[#efe3d5] border border-[#d5969a]">
                      <div
                        className="h-full bg-[#8E1018] transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {selectedSession.status === 'open' && (
                      <div className="flex items-start gap-2 text-xs text-[#1D6B3E] bg-[#F2FBF5] border border-[#1D6B3E]/40 px-3 py-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          <strong>Đang bảo mật kết quả kiểm phiếu:</strong> Trong khi hòm phiếu đang mở, hệ thống chỉ hiển thị số lượng người đã bỏ phiếu. Kết quả chi tiết chỉ được mở sau khi bấm <strong>“Chốt phiên &amp; Công bố kết quả”</strong>.
                        </span>
                      </div>
                    )}

                    {/* Attendance Checklist (Who voted / Who hasn't — NEVER ballot choices) */}
                    {showAttendanceList && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pt-1 max-h-56 overflow-y-auto">
                        {selectedSession.eligibleVoters.map((v) => {
                          const att = selectedAttendance.find(
                            (a) => a.voterId === v.id
                          );
                          const hasVoted = votedIdsSet.has(v.id);
                          return (
                            <div
                              key={v.id}
                              className={`px-2.5 py-1.5 border text-xs flex items-center justify-between gap-2 ${
                                hasVoted
                                  ? 'bg-[#F2FBF5] border-[#1D6B3E]/40 text-[#1D6B3E]'
                                  : 'bg-white border-[#e3c8c9] text-[#594446]'
                              }`}
                            >
                              <span className="font-bold truncate">
                                {v.name}
                              </span>
                              <span className="shrink-0 whitespace-nowrap">
                                {hasVoted ? (
                                  <span
                                    className="inline-flex items-center gap-0.5 font-bold"
                                    title={
                                      att ? formatDateTimeVN(att.votedAt) : ''
                                    }
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Đã bỏ
                                  </span>
                                ) : (
                                  'Chưa bỏ'
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CLOSED SESSION: AUTOMATIC RANKING CARD (FOR MULTI-BRANCH MẪU 4) */}
              {selectedSession.status === 'closed' &&
                tally &&
                isMultiBranchCollectiveSession(selectedSession) &&
                (() => {
                  const ranking = computeBranchRanking(selectedSession, tally);
                  const ubktMajority = ranking.ubktCounts
                    ? getMajorityRating(
                        ranking.ubktCounts,
                        ranking.totalBallots
                      )
                    : null;
                  return (
                    <div className="bg-white border-2 border-[#8E1018] shadow-sm">
                      <div className="bg-[#FDF6DE] px-5 py-3 border-b-2 border-[#C8941A] flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-base text-[#8E1018] flex items-center gap-2">
                          <Award className="w-5 h-5 shrink-0" />
                          <span>
                            BẢNG XẾP HẠNG TÌM CHI BỘ HOÀN THÀNH XUẤT SẮC NHIỆM VỤ
                          </span>
                        </div>
                        <span className="text-xs font-bold text-[#6b0b12]">
                          Chỉ tiêu tối đa: 01/04 Chi bộ (≤ 20%)
                        </span>
                      </div>

                      <div className="p-4 space-y-3.5">
                        {/* Conclusion Banner */}
                        {ranking.totalBallots === 0 ? (
                          <div className="p-3 bg-[#FAF8F3] border border-[#d5969a] text-sm text-[#594446]">
                            Chưa có phiếu bầu hợp lệ nào trong phiên này.
                          </div>
                        ) : ranking.clearWinner ? (
                          <div className="p-3.5 bg-[#F2FBF5] border-2 border-[#1D6B3E] text-sm text-[#144d2c] flex items-start gap-2.5">
                            <CheckCircle2 className="w-5 h-5 text-[#1D6B3E] shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-base">
                                Chi bộ dẫn đầu và đạt quá bán phiếu HTXSNV:{' '}
                                <span className="text-[#8E1018] underline">
                                  {ranking.clearWinner.candidate.name}
                                </span>
                              </div>
                              <div className="text-xs mt-0.5">
                                Đạt{' '}
                                <strong>
                                  {ranking.clearWinner.htxsnvCount}/
                                  {ranking.totalBallots} phiếu (
                                  {ranking.clearWinner.htxsnvPercent.toFixed(1)}
                                  %)
                                </strong>{' '}
                                ở mức Hoàn thành xuất sắc nhiệm vụ (&gt; 50% số
                                phiếu hợp lệ) — đủ điều kiện đề xuất xếp loại{' '}
                                <strong>Hoàn thành xuất sắc nhiệm vụ</strong>.
                              </div>
                            </div>
                          </div>
                        ) : ranking.tiedLeaders.length > 1 ? (
                          <div className="p-3.5 bg-[#FCF8E8] border-2 border-[#C8941A] text-sm text-[#4b3512] flex items-start gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-[#8E1018] shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-[#8E1018]">
                                Lưu ý: Có {ranking.tiedLeaders.length} Chi bộ bằng phiếu HTXSNV cao nhất (
                                {ranking.tiedLeaders
                                  .map((t) => t.candidate.name)
                                  .join(', ')}{' '}
                                — cùng {ranking.topHtxsnvCount}/
                                {ranking.totalBallots} phiếu)
                              </div>
                              <div className="text-xs mt-0.5">
                                Đề nghị BCH Đảng uỷ thảo luận và tổ chức bỏ phiếu
                                vòng 2 giữa các Chi bộ đồng hạng để chọn đúng 01
                                Chi bộ xuất sắc nhất.
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3.5 bg-[#FCF8E8] border-2 border-[#C8941A] text-sm text-[#4b3512] flex items-start gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-[#8E1018] shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-[#8E1018]">
                                Chưa có Chi bộ nào đạt quá bán (&gt; 50%) phiếu
                                mức HTXSNV
                              </div>
                              <div className="text-xs mt-0.5">
                                {ranking.rankedBranches.length > 0 &&
                                ranking.topHtxsnvCount > 0 ? (
                                  <>
                                    Cao nhất là{' '}
                                    <strong>
                                      {ranking.rankedBranches[0].candidate.name}
                                    </strong>{' '}
                                    với{' '}
                                    <strong>
                                      {ranking.topHtxsnvCount}/
                                      {ranking.totalBallots} phiếu (
                                      {ranking.rankedBranches[0].htxsnvPercent.toFixed(
                                        1
                                      )}
                                      %)
                                    </strong>
                                    . Đề nghị BCH Đảng uỷ xem xét, quyết định
                                    theo quy chế.
                                  </>
                                ) : (
                                  'Không có Chi bộ nào nhận phiếu ở mức HTXSNV.'
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Ranked Branches List */}
                        <div className="space-y-2">
                          {ranking.rankedBranches.map((item) => {
                            const isClearWinner =
                              ranking.clearWinner?.candidate.id ===
                              item.candidate.id;
                            const isTied =
                              ranking.tiedLeaders.length > 1 && item.isTopHtxsnv;
                            return (
                              <div
                                key={item.candidate.id}
                                className={`p-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                  isClearWinner
                                    ? 'bg-[#FDF6DE] border-[#8E1018]'
                                    : isTied
                                      ? 'bg-[#FCF8E8] border-[#C8941A]'
                                      : 'bg-[#FAF8F3] border-[#e3c8c9]'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-[180px]">
                                  <span
                                    className={`w-7 h-7 inline-flex items-center justify-center font-bold text-xs tabular-nums shrink-0 ${
                                      item.rank === 1 && item.htxsnvCount > 0
                                        ? 'bg-[#8E1018] text-[#F6CF62]'
                                        : 'bg-white border border-[#b8424a] text-[#6b0b12]'
                                    }`}
                                  >
                                    #{item.rank}
                                  </span>
                                  <div>
                                    <div className="font-bold text-sm text-[#261617]">
                                      {item.candidate.name}
                                    </div>
                                    <div className="text-[11px] text-[#5c4748]">
                                      Tự nhận:{' '}
                                      <strong>
                                        {item.candidate.selfRatingShort || '—'}
                                      </strong>{' '}
                                      · HTTNV: {item.httnvCount} · HTNV:{' '}
                                      {item.htnvCount}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex-1 max-w-md flex items-center gap-3">
                                  <div className="flex-1 h-3 bg-[#efe3d5] border border-[#d5969a]">
                                    <div
                                      className={`h-full transition-all ${
                                        isClearWinner
                                          ? 'bg-[#1D6B3E]'
                                          : 'bg-[#8E1018]'
                                      }`}
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          Math.max(0, item.htxsnvPercent)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="w-36 text-right text-xs font-bold tabular-nums text-[#8E1018] shrink-0">
                                    HTXSNV: {item.htxsnvCount}/
                                    {ranking.totalBallots} (
                                    {item.htxsnvPercent.toFixed(1)}%)
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Separate UBKT Summary if included */}
                        {ranking.ubktCandidate && (
                          <div className="pt-2 border-t border-[#e3c8c9] flex flex-wrap items-center justify-between gap-2 text-xs bg-[#FAF8F3] px-3 py-2 border">
                            <span className="font-bold text-[#6b0b12]">
                              Đánh giá riêng — {ranking.ubktCandidate.name}:
                            </span>
                            <span className="tabular-nums text-[#261617]">
                              HTXSNV:{' '}
                              <strong>
                                {ranking.ubktCounts?.HTXSNV ?? 0}/
                                {ranking.totalBallots}
                              </strong>{' '}
                              · HTTNV:{' '}
                              <strong>
                                {ranking.ubktCounts?.HTTNV ?? 0}/
                                {ranking.totalBallots}
                              </strong>{' '}
                              · Mức đạt đa số:{' '}
                              <strong className="text-[#8E1018]">
                                {ubktMajority
                                  ? SHORT_TO_RATING[ubktMajority]
                                  : '—'}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* CLOSED SESSION: OFFICIAL TALLY TABLE & EXPORT / SYNC ACTIONS */}
              {selectedSession.status === 'closed' && (
                <div className="bg-white border-2 border-[#8E1018] shadow-sm">
                  <div className="bg-[#8E1018] text-white px-5 py-3 border-b-2 border-[#F6CF62] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-base">
                        KẾT QUẢ KIỂM PHIẾU CHÍNH THỨC (
                        {tally?.totalBallots ?? 0} phiếu hợp lệ)
                      </div>
                      <div className="text-[11px] text-[#F6CF62]">
                        Tự động xếp hạng từ cao đến thấp — ưu tiên phiếu HTXSNV trước, sau đó đến HTTNV
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={!tally}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F6CF62] text-[#8E1018] font-bold text-xs hover:bg-[#f2c444] disabled:opacity-50"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Xuất Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPrintModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#8E1018] font-bold text-xs hover:bg-[#FBF0C9]"
                      >
                        <Printer className="w-4 h-4" />
                        In / PDF Biên bản
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSyncModal(true)}
                        disabled={syncableUpdates.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1D6B3E] text-white font-bold text-xs hover:bg-[#15522F] disabled:opacity-50"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        Đồng bộ vào Hồ sơ ({syncableUpdates.length})
                      </button>
                    </div>
                  </div>

                  <div className="p-4 overflow-x-auto">
                    {loadingTally ? (
                      <div className="py-8 text-center text-[#8E1018] font-bold">
                        Đang tổng hợp kết quả kiểm phiếu từ hòm phiếu kín...
                      </div>
                    ) : (
                      <table className="party-table text-[14px]">
                        <thead>
                          <tr>
                            <th rowSpan={2} className="w-12 text-center">
                              STT
                            </th>
                            <th rowSpan={2} className="min-w-[190px]">
                              {selectedSession.template === 'mau4'
                                ? 'Tên tổ chức đảng, tập thể'
                                : 'Họ và tên'}
                            </th>
                            {selectedSession.template === 'mau5' && (
                              <th rowSpan={2} className="w-24 text-center">
                                Chức vụ
                              </th>
                            )}
                            <th rowSpan={2} className="w-24 text-center">
                              Tự nhận
                            </th>
                            <th colSpan={4} className="text-center">
                              Kết quả kiểm phiếu
                            </th>
                            <th rowSpan={2} className="w-40 text-center">
                              Mức đạt đa số
                            </th>
                          </tr>
                          <tr>
                            {SHORT_RATING_OPTIONS.map((opt) => (
                              <th
                                key={opt.code}
                                className="w-24 text-center text-xs"
                              >
                                {opt.code}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortCandidatesByTally(
                            selectedSession.candidates,
                            tally
                          ).map((cand, idx) => {
                            const totalBallots = tally?.totalBallots ?? 0;
                            const counts = tally?.tallies?.[cand.id];
                            const majority = getMajorityRating(
                              counts,
                              totalBallots
                            );

                            return (
                              <tr key={cand.id}>
                                <td className="text-center tabular-nums font-bold">
                                  {idx + 1}
                                </td>
                                <td className="font-bold text-[#261617]">
                                  {cand.name}
                                  {cand.group === 'ubkt' &&
                                    hasIndependentUbktRule(selectedSession) && (
                                      <span className="block text-[11px] font-normal text-[#6b0b12]">
                                        (Đánh giá độc lập)
                                      </span>
                                    )}
                                </td>
                                {selectedSession.template === 'mau5' && (
                                  <td className="text-center">
                                    {cand.position || 'ĐV'}
                                  </td>
                                )}
                                <td className="text-center font-bold text-[#6b0b12]">
                                  {cand.selfRatingShort || '—'}
                                </td>
                                {SHORT_RATING_OPTIONS.map((opt) => {
                                  const n = counts?.[opt.code] ?? 0;
                                  const pct =
                                    totalBallots > 0
                                      ? ((n / totalBallots) * 100).toFixed(1)
                                      : '0.0';
                                  const isWinner =
                                    majority === opt.code && n > 0;
                                  return (
                                    <td
                                      key={opt.code}
                                      className={`text-center tabular-nums ${
                                        isWinner
                                          ? 'bg-[#FDF6DE] font-bold text-[#8E1018]'
                                          : ''
                                      }`}
                                    >
                                      <div>
                                        {n}/{totalBallots}
                                      </div>
                                      <div className="text-[11px] text-[#5c4748]">
                                        ({pct}%)
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="text-center font-bold text-[#8E1018] text-xs">
                                  {majority ? SHORT_TO_RATING[majority] : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm Close & Reveal Tally Modal */}
      {confirmCloseModal && selectedSession && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận chốt phiên bỏ phiếu"
        >
          <div className="bg-white border-2 border-[#8E1018] max-w-md w-full shadow-xl">
            <div className="bg-[#8E1018] text-white px-5 py-3 font-bold text-lg border-b-2 border-[#F6CF62]">
              Chốt phiên &amp; Công bố kết quả kiểm phiếu
            </div>
            <div className="p-5 text-[15px] text-[#261617] space-y-2.5">
              <p className="m-0">
                Hiện tại đã có{' '}
                <strong className="text-[#8E1018]">
                  {votedCount} / {eligibleCount} đồng chí
                </strong>{' '}
                hoàn thành bỏ phiếu.
              </p>
              {votedCount < eligibleCount && (
                <div className="p-3 bg-[#FCF8E8] border border-[#D4A73E] text-sm text-[#4b3512] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#8E1018] shrink-0 mt-0.5" />
                  <span>
                    Vẫn còn <strong>{eligibleCount - votedCount}</strong> đồng chí chưa bỏ phiếu. Sau khi chốt phiên, cử tri sẽ không thể gửi thêm phiếu nữa.
                  </span>
                </div>
              )}
              <p className="m-0 font-bold text-[#6b0b12]">
                Bạn có chắc chắn muốn khoá hòm phiếu và mở kết quả kiểm phiếu ngay bây giờ?
              </p>
            </div>
            <div className="px-5 py-3 bg-[#FBF7EC] border-t border-[#d5969a] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmCloseModal(false)}
                disabled={isMutating}
                className="px-4 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                Chưa chốt
              </button>
              <button
                type="button"
                onClick={() => void handleChangeStatus('closed')}
                disabled={isMutating}
                className="px-4 py-1.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50"
              >
                {isMutating ? 'Đang chốt...' : 'Chốt & Kiểm phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Session Modal */}
      {confirmDeleteModal && selectedSession && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xoá phiên bỏ phiếu"
        >
          <div className="bg-white border-2 border-[#8E1018] max-w-md w-full shadow-xl">
            <div className="bg-[#8E1018] text-white px-5 py-3 font-bold text-lg border-b-2 border-[#F6CF62]">
              Xác nhận xoá phiên bỏ phiếu
            </div>
            <div className="p-5 text-[15px] text-[#261617] space-y-2">
              <p className="m-0">
                Bạn sắp xoá vĩnh viễn phiên{' '}
                <strong>{selectedSession.title}</strong> cùng toàn bộ phiếu bầu và danh sách điểm danh của phiên này.
              </p>
              <p className="m-0 font-bold text-[#8E1018]">
                Thao tác này không thể hoàn tác. Bạn chắc chắn muốn xoá?
              </p>
            </div>
            <div className="px-5 py-3 bg-[#FBF7EC] border-t border-[#d5969a] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal(false)}
                disabled={isMutating}
                className="px-4 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSession()}
                disabled={isMutating}
                className="px-4 py-1.5 bg-[#8E1018] text-white font-bold hover:bg-[#730B12] disabled:opacity-50"
              >
                {isMutating ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Results to Dossiers Modal */}
      {showSyncModal && selectedSession && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Đồng bộ kết quả kiểm phiếu vào hồ sơ"
        >
          <div className="bg-white border-2 border-[#8E1018] max-w-lg w-full shadow-xl">
            <div className="bg-[#8E1018] text-white px-5 py-3 font-bold text-lg border-b-2 border-[#F6CF62]">
              Đồng bộ kết quả kiểm phiếu vào Hồ sơ kiểm điểm
            </div>
            <div className="p-5 text-[15px] text-[#261617] space-y-4">
              <p className="m-0">
                Hệ thống sẽ tự động ghi nhận <strong>Mức đạt đa số</strong> cho{' '}
                <strong className="text-[#8E1018]">
                  {syncableUpdates.length} hồ sơ
                </strong>{' '}
                có liên kết trong phiên <em>{selectedSession.title}</em>.
              </p>

              {session.type === 'admin' ? (
                <div className="space-y-2">
                  <div className="font-bold text-sm text-[#6b0b12]">
                    Chọn mục đích ghi nhận trên hồ sơ kiểm điểm:
                  </div>
                  <label className="flex items-start gap-2.5 p-2.5 border border-[#d5969a] bg-[#FAF8F3] cursor-pointer">
                    <input
                      type="radio"
                      name="syncTarget"
                      checked={syncTargetField === 'officialRating'}
                      onChange={() => setSyncTargetField('officialRating')}
                      className="mt-1 accent-[#8E1018]"
                    />
                    <span className="text-sm">
                      <strong>Mức xếp loại chính thức (Đảng uỷ quyết định)</strong>
                      <span className="block text-xs text-[#5c4748]">
                        Sẽ hiển thị ngay vào bảng Tổng hợp &amp; Xuất Excel toàn Đảng bộ.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 p-2.5 border border-[#d5969a] bg-[#FAF8F3] cursor-pointer">
                    <input
                      type="radio"
                      name="syncTarget"
                      checked={syncTargetField === 'branchProposedRating'}
                      onChange={() =>
                        setSyncTargetField('branchProposedRating')
                      }
                      className="mt-1 accent-[#8E1018]"
                    />
                    <span className="text-sm">
                      <strong>Mức chi bộ / đơn vị đề nghị</strong>
                      <span className="block text-xs text-[#5c4748]">
                        Ghi nhận kết quả đề nghị sau họp chi bộ để Đảng uỷ xem xét duyệt chính thức.
                      </span>
                    </span>
                  </label>
                </div>
              ) : isMultiBranchCollectiveSession(selectedSession) ? (
                <div className="p-3.5 bg-[#FCF8E8] border border-[#C8941A] text-sm text-[#4b3512] space-y-1.5">
                  <div className="font-bold text-[#8E1018]">
                    Quyền đồng bộ đồng loạt hồ sơ 4 Chi bộ &amp; UBKT
                  </div>
                  <p className="m-0 text-xs leading-relaxed">
                    Tài khoản <strong>Thư ký Đảng bộ trường</strong> có thể xuất Excel kiểm phiếu và in Biên bản Mẫu 4 ngay lập tức. Do hồ sơ tập thể của Chi bộ 1–4 và UBKT thuộc quyền duyệt chung của Đảng uỷ, vui lòng dùng tài khoản <strong>Admin Đảng uỷ</strong> để bấm <strong>“Đồng bộ vào Hồ sơ”</strong> và ghi nhận <em>Mức xếp loại chính thức</em> cho tất cả tập thể chỉ với 1 bấm.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-[#FCF8E8] border border-[#D4A73E] text-sm text-[#4b3512]">
                  Kết quả kiểm phiếu sẽ được tự động cập nhật vào trường{' '}
                  <strong>“Mức chi bộ / đơn vị đề nghị”</strong> của các hồ sơ chưa bị Đảng uỷ khoá trong {session.branch}.
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-[#FBF7EC] border-t border-[#d5969a] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                disabled={isSyncing}
                className="px-4 py-1.5 bg-white border border-[#8E1018] text-[#8E1018] font-bold hover:bg-[#FBF0C9]"
              >
                {session.type === 'branch' &&
                isMultiBranchCollectiveSession(selectedSession)
                  ? 'Đã hiểu'
                  : 'Huỷ bỏ'}
              </button>
              {!(
                session.type === 'branch' &&
                isMultiBranchCollectiveSession(selectedSession)
              ) && (
                <button
                  type="button"
                  onClick={() => void handleExecuteSync()}
                  disabled={isSyncing}
                  className="px-5 py-1.5 bg-[#1D6B3E] text-white font-bold hover:bg-[#15522F] disabled:opacity-50"
                >
                  {isSyncing
                    ? 'Đang đồng bộ...'
                    : `Đồng bộ ${syncableUpdates.length} hồ sơ`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Official Print / PDF Modal */}
      {showPrintModal && selectedSession && (
        <VotingPrintModal
          session={selectedSession}
          tally={tally}
          attendanceCount={selectedAttendance.length}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
};
