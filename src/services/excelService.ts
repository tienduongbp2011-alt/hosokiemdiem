import * as XLSX from 'xlsx';
import {
  ALL_UNITS,
  BranchUnitName,
  Dossier,
  DossierStatus,
  DossierType,
  POSITION_GROUPS,
  PositionGroup,
  RATING_OPTIONS,
  SHORT_RATING_OPTIONS,
  SHORT_TO_RATING,
  ShortRating,
  UnitName,
  VOTING_CATEGORY_META,
  VotingSession,
  VotingTallyResult,
  computeBranchRanking,
  countDossierAttachments,
  formatDateTimeVN,
  formatDateVN,
  getDossierDisplayName,
  getIndividualChecklistSummary,
  isMultiBranchCollectiveSession,
} from '../types';

export interface ParsedExcelRow {
  rowNumber: number;
  code: string;
  fullName: string;
  branch: BranchUnitName | '';
  positionGroup: PositionGroup;
  year: number | null;
  action: 'create' | 'update' | 'error';
  errors: string[];
  existingDossierId?: string;
}

export function downloadIndividualExcelTemplate(): void {
  const rows = [
    {
      'Mã hồ sơ': 'CB1-01',
      'Họ và tên': 'Nguyễn Văn A',
      'Chi bộ': 'Chi bộ 1',
      'Nhóm chức vụ': 'Giữ chức vụ lãnh đạo, quản lý',
      'Năm': 2026,
    },
    {
      'Mã hồ sơ': 'CB2-01',
      'Họ và tên': 'Trần Thị B',
      'Chi bộ': 'Chi bộ 2',
      'Nhóm chức vụ': 'Không giữ chức vụ lãnh đạo, quản lý',
      'Năm': 2026,
    },
    {
      'Mã hồ sơ': 'CB3-01',
      'Họ và tên': 'Phạm Thị C',
      'Chi bộ': 'Chi bộ 3',
      'Nhóm chức vụ': 'Giữ chức vụ lãnh đạo, quản lý',
      'Năm': 2026,
    },
    {
      'Mã hồ sơ': 'CB4-01',
      'Họ và tên': 'Hoàng Văn D',
      'Chi bộ': 'Chi bộ 4',
      'Nhóm chức vụ': 'Không giữ chức vụ lãnh đạo, quản lý',
      'Năm': 2026,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 14 },
    { wch: 38 },
    { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách cá nhân');
  XLSX.writeFile(wb, 'Mau_nhap_ho_so_ca_nhan_2026.xlsx');
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function parseBranch(raw: string): BranchUnitName | '' {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'chi bộ 1' || cleaned === 'chi bo 1' || cleaned === 'cb1') {
    return 'Chi bộ 1';
  }
  if (cleaned === 'chi bộ 2' || cleaned === 'chi bo 2' || cleaned === 'cb2') {
    return 'Chi bộ 2';
  }
  if (cleaned === 'chi bộ 3' || cleaned === 'chi bo 3' || cleaned === 'cb3') {
    return 'Chi bộ 3';
  }
  if (cleaned === 'chi bộ 4' || cleaned === 'chi bo 4' || cleaned === 'cb4') {
    return 'Chi bộ 4';
  }
  return '';
}

function parsePositionGroup(raw: string): { valid: boolean; value: PositionGroup } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, value: '' };
  const normalized = trimmed.toLowerCase();
  for (const group of POSITION_GROUPS) {
    if (group.toLowerCase() === normalized) {
      return { valid: true, value: group };
    }
  }
  if (
    normalized.includes('không giữ chức vụ') ||
    normalized.includes('khong giu chuc vu')
  ) {
    return { valid: true, value: 'Không giữ chức vụ lãnh đạo, quản lý' };
  }
  if (
    normalized.includes('giữ chức vụ') ||
    normalized.includes('giu chuc vu') ||
    normalized.includes('lãnh đạo')
  ) {
    return { valid: true, value: 'Giữ chức vụ lãnh đạo, quản lý' };
  }
  return { valid: false, value: '' };
}

export async function parseIndividualExcelFile(
  file: File,
  existingDossiers: Dossier[]
): Promise<{ rows: ParsedExcelRow[]; fatalError?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], fatalError: 'Tệp Excel không có trang tính nào.' };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });

    if (rawMatrix.length < 2) {
      return {
        rows: [],
        fatalError: 'Tệp Excel chưa có dữ liệu (chỉ có tiêu đề hoặc trống).',
      };
    }

    const headers = (rawMatrix[0] as unknown[]).map((h) =>
      normalizeHeaderKey(String(h ?? ''))
    );

    const findCol = (candidates: string[]) =>
      headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

    const idxCode = findCol(['ma ho so', 'ma hs']);
    const idxName = findCol(['ho va ten', 'ho ten']);
    const idxBranch = findCol(['chi bo']);
    const idxPos = findCol(['nhom chuc vu', 'chuc vu']);
    const idxYear = findCol(['nam']);

    if (idxCode === -1 || idxBranch === -1 || idxYear === -1) {
      return {
        rows: [],
        fatalError:
          'Tệp Excel thiếu cột bắt buộc. Cần có đủ các cột: Mã hồ sơ, Họ và tên, Chi bộ, Nhóm chức vụ, Năm.',
      };
    }

    const existingMap = new Map<string, Dossier>();
    for (const d of existingDossiers) {
      if (d.type === 'individual') {
        existingMap.set(`${d.year}_${d.code.toUpperCase()}`, d);
      }
    }

    const seenInFile = new Set<string>();
    const parsedRows: ParsedExcelRow[] = [];

    for (let i = 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i] as unknown[];
      const isCompletelyEmpty = rowArr.every(
        (cell) => String(cell ?? '').trim() === ''
      );
      if (isCompletelyEmpty) continue;

      const rawCode = String(rowArr[idxCode] ?? '').trim().toUpperCase();
      const rawName = idxName >= 0 ? String(rowArr[idxName] ?? '').trim() : '';
      const rawBranch = String(rowArr[idxBranch] ?? '').trim();
      const rawPos = idxPos >= 0 ? String(rowArr[idxPos] ?? '').trim() : '';
      const rawYearStr = String(rowArr[idxYear] ?? '').trim();

      const errors: string[] = [];

      if (!rawCode) {
        errors.push('Thiếu Mã hồ sơ');
      }

      const parsedBranch = parseBranch(rawBranch);
      if (!parsedBranch) {
        errors.push(
          `Chi bộ không hợp lệ ("${rawBranch || 'trống'}"). Chỉ nhận "Chi bộ 1", "Chi bộ 2", "Chi bộ 3" hoặc "Chi bộ 4"`
        );
      }

      const posRes = parsePositionGroup(rawPos);
      if (!posRes.valid) {
        errors.push(`Nhóm chức vụ không hợp lệ ("${rawPos}")`);
      }

      const yearNum = Number.parseInt(rawYearStr, 10);
      const validYear =
        !Number.isNaN(yearNum) && yearNum >= 2020 && yearNum <= 2100
          ? yearNum
          : null;
      if (validYear === null) {
        errors.push(`Năm không hợp lệ ("${rawYearStr || 'trống'}")`);
      }

      let existingDossierId: string | undefined;
      if (rawCode && validYear !== null) {
        const compositeKey = `${validYear}_${rawCode}`;
        if (seenInFile.has(compositeKey)) {
          errors.push(
            `Trùng Mã hồ sơ (${rawCode}) và Năm (${validYear}) trong tệp`
          );
        } else {
          seenInFile.add(compositeKey);
        }
        const existing = existingMap.get(compositeKey);
        if (existing) {
          existingDossierId = existing.id;
        }
      }

      parsedRows.push({
        rowNumber: i + 1,
        code: rawCode,
        fullName: rawName,
        branch: parsedBranch,
        positionGroup: posRes.value,
        year: validYear,
        action:
          errors.length > 0
            ? 'error'
            : existingDossierId
              ? 'update'
              : 'create',
        errors,
        existingDossierId,
      });
    }

    if (parsedRows.length === 0) {
      return {
        rows: [],
        fatalError: 'Không tìm thấy dòng dữ liệu nào trong tệp Excel.',
      };
    }

    return { rows: parsedRows };
  } catch {
    return {
      rows: [],
      fatalError:
        'Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng .xlsx hoặc .xls hợp lệ.',
    };
  }
}

export interface ExportFilterContext {
  year: number | 'all';
  branch: UnitName | 'all';
  type: DossierType | 'all';
  status: DossierStatus | 'all';
}

export function exportSummaryToExcel(
  filteredDossiers: Dossier[],
  filters: ExportFilterContext
): string {
  const unitsToInclude: UnitName[] =
    filters.branch === 'all' ? ALL_UNITS : [filters.branch];

  // Sheet 1: Tổng hợp xếp loại (chỉ tính từ Mức xếp loại chính thức)
  const summaryRows: Record<string, string | number>[] = [];

  let grandTotal = 0;
  let grandHTXS = 0;
  let grandHTT = 0;
  let grandHT = 0;
  let grandKHT = 0;
  let grandNoResult = 0;

  for (const unit of unitsToInclude) {
    const unitItems = filteredDossiers.filter((d) => d.branch === unit);
    const total = unitItems.length;
    const htxs = unitItems.filter(
      (d) => d.officialRating === RATING_OPTIONS[0]
    ).length;
    const htt = unitItems.filter(
      (d) => d.officialRating === RATING_OPTIONS[1]
    ).length;
    const ht = unitItems.filter(
      (d) => d.officialRating === RATING_OPTIONS[2]
    ).length;
    const kht = unitItems.filter(
      (d) => d.officialRating === RATING_OPTIONS[3]
    ).length;
    const noResult = unitItems.filter((d) => !d.officialRating).length;

    grandTotal += total;
    grandHTXS += htxs;
    grandHTT += htt;
    grandHT += ht;
    grandKHT += kht;
    grandNoResult += noResult;

    summaryRows.push({
      'Đơn vị / Chi bộ': unit,
      'Tổng số hồ sơ': total,
      'Hoàn thành xuất sắc nhiệm vụ': htxs,
      'Hoàn thành tốt nhiệm vụ': htt,
      'Hoàn thành nhiệm vụ': ht,
      'Không hoàn thành nhiệm vụ': kht,
      'Chưa có kết quả chính thức': noResult,
    });
  }

  summaryRows.push({
    'Đơn vị / Chi bộ': 'Tổng toàn Đảng bộ',
    'Tổng số hồ sơ': grandTotal,
    'Hoàn thành xuất sắc nhiệm vụ': grandHTXS,
    'Hoàn thành tốt nhiệm vụ': grandHTT,
    'Hoàn thành nhiệm vụ': grandHT,
    'Không hoàn thành nhiệm vụ': grandKHT,
    'Chưa có kết quả chính thức': grandNoResult,
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 28 },
    { wch: 24 },
    { wch: 22 },
    { wch: 26 },
    { wch: 26 },
  ];

  // Sheet 2: Danh sách hồ sơ (kèm tình trạng nộp Mẫu 2A/2B, PL9/10, Mẫu 3, Quy định 221)
  const listRows = filteredDossiers.map((d, index) => {
    const check =
      d.type === 'individual' ? getIndividualChecklistSummary(d) : null;
    return {
      STT: index + 1,
      'Mã hồ sơ': d.code,
      'Họ và tên / Tên tập thể': getDossierDisplayName(d),
      'Loại hồ sơ': d.type === 'collective' ? 'Hồ sơ tập thể' : 'Hồ sơ cá nhân',
      'Đơn vị / Chi bộ': d.branch,
      'Nhóm chức vụ':
        d.type === 'collective' ? 'Tập thể' : d.positionGroup || 'Chưa chọn',
      Năm: d.year,
      'Trạng thái': d.status,
      'Số tệp đã nộp': countDossierAttachments(d),
      'Mẫu 02A/02B': check ? check.mau02Status : '—',
      'Phụ lục 9/10': check ? check.phuLucStatus : '—',
      'Phiếu BSLL Mẫu 3': check ? check.mau3Status : '—',
      'Quy định nơi cư trú 221': check ? check.cuTru221Status : '—',
      'Mức cá nhân tự đề xuất':
        d.type === 'collective' ? '—' : d.selfProposedRating || '',
      'Mức chi bộ đề nghị': d.branchProposedRating || '',
      'Mức xếp loại chính thức': d.officialRating || '',
      'Cập nhật gần nhất': formatDateTimeVN(d.updatedAt),
    };
  });

  const wsList = XLSX.utils.json_to_sheet(
    listRows.length > 0
      ? listRows
      : [
          {
            STT: '',
            'Mã hồ sơ': '',
            'Họ và tên / Tên tập thể': 'Không có dữ liệu phù hợp bộ lọc',
            'Loại hồ sơ': '',
            'Đơn vị / Chi bộ': '',
            'Nhóm chức vụ': '',
            Năm: '',
            'Trạng thái': '',
            'Số tệp đã nộp': '',
            'Mẫu 02A/02B': '',
            'Phụ lục 9/10': '',
            'Phiếu BSLL Mẫu 3': '',
            'Quy định nơi cư trú 221': '',
            'Mức cá nhân tự đề xuất': '',
            'Mức chi bộ đề nghị': '',
            'Mức xếp loại chính thức': '',
            'Cập nhật gần nhất': '',
          },
        ]
  );
  wsList['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 32 },
    { wch: 8 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 26 },
    { wch: 26 },
    { wch: 26 },
    { wch: 20 },
  ];

  // Sheet 3: Hồ sơ cần bổ sung
  const needRevisionDossiers = filteredDossiers.filter(
    (d) => d.status === 'Cần bổ sung'
  );
  const revisionRows = needRevisionDossiers.map((d, index) => {
    const latestReq = d.revisionRequests[d.revisionRequests.length - 1];
    return {
      STT: index + 1,
      'Mã hồ sơ': d.code,
      'Họ và tên / Tên tập thể': getDossierDisplayName(d),
      'Loại hồ sơ': d.type === 'collective' ? 'Hồ sơ tập thể' : 'Hồ sơ cá nhân',
      'Đơn vị / Chi bộ': d.branch,
      Năm: d.year,
      'Tài liệu còn thiếu': latestReq ? latestReq.missingItems.join('; ') : '',
      'Nội dung yêu cầu': latestReq ? latestReq.details : '',
      'Hạn nộp lại': latestReq ? formatDateVN(latestReq.deadline) : '',
      'Vai trò yêu cầu': latestReq ? latestReq.requestedByRole : '',
      'Thời điểm yêu cầu': latestReq
        ? formatDateTimeVN(latestReq.createdAt)
        : '',
    };
  });

  const wsRevision = XLSX.utils.json_to_sheet(
    revisionRows.length > 0
      ? revisionRows
      : [
          {
            STT: '',
            'Mã hồ sơ': '',
            'Họ và tên / Tên tập thể':
              'Không có hồ sơ cần bổ sung theo bộ lọc hiện tại',
            'Loại hồ sơ': '',
            'Đơn vị / Chi bộ': '',
            Năm: '',
            'Tài liệu còn thiếu': '',
            'Nội dung yêu cầu': '',
            'Hạn nộp lại': '',
            'Vai trò yêu cầu': '',
            'Thời điểm yêu cầu': '',
          },
        ]
  );
  wsRevision['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 8 },
    { wch: 36 },
    { wch: 40 },
    { wch: 14 },
    { wch: 24 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng hợp xếp loại');
  XLSX.utils.book_append_sheet(wb, wsList, 'Danh sách hồ sơ');
  XLSX.utils.book_append_sheet(wb, wsRevision, 'Hồ sơ cần bổ sung');

  const yearTag = filters.year === 'all' ? 'Tat_ca_nam' : String(filters.year);
  const fileName = `Tong_hop_kiem_diem_Dang_bo_THPT_Thanh_Hoa_${yearTag}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

function resolveMajorityShortRating(
  counts: Record<ShortRating, number> | undefined,
  totalBallots: number
): ShortRating | '' {
  if (!counts || totalBallots <= 0) return '';
  let best: ShortRating | '' = '';
  let bestVal = -1;
  for (const opt of SHORT_RATING_OPTIONS) {
    const val = counts[opt.code] ?? 0;
    if (val > bestVal) {
      bestVal = val;
      best = opt.code;
    }
  }
  return bestVal > 0 ? best : '';
}

export function exportVotingResultToExcel(
  session: VotingSession,
  tally: VotingTallyResult,
  attendanceCount: number
): string {
  const isMau4 = session.template === 'mau4';
  const totalBallots = tally.totalBallots;

  const formatCell = (count: number) => {
    const pct =
      totalBallots > 0 ? ((count / totalBallots) * 100).toFixed(1) : '0.0';
    return `${count}/${totalBallots} (${pct}%)`;
  };

  // Sheet 1: Kết quả kiểm phiếu
  const resultRows = session.candidates.map((cand, index) => {
    const counts = tally.tallies[cand.id];
    const htxs = counts?.HTXSNV ?? 0;
    const htt = counts?.HTTNV ?? 0;
    const ht = counts?.HTNV ?? 0;
    const kht = counts?.KHTNV ?? 0;
    const majority = resolveMajorityShortRating(counts, totalBallots);

    if (isMau4) {
      return {
        STT: index + 1,
        'Tên tổ chức đảng, tập thể lãnh đạo, quản lý': cand.name,
        'Tự nhận mức xếp loại': cand.selfRatingShort || '—',
        'Hoàn thành xuất sắc nhiệm vụ': formatCell(htxs),
        'Hoàn thành tốt nhiệm vụ': formatCell(htt),
        'Hoàn thành nhiệm vụ': formatCell(ht),
        'Không hoàn thành nhiệm vụ': formatCell(kht),
        'Mức đạt đa số': majority ? SHORT_TO_RATING[majority] : 'Chưa có phiếu',
      };
    }

    return {
      STT: index + 1,
      'Họ và tên': cand.name,
      'Chức vụ': cand.position || 'ĐV',
      'Tự nhận mức': cand.selfRatingShort || '—',
      'Hoàn thành xuất sắc nhiệm vụ': formatCell(htxs),
      'Hoàn thành tốt nhiệm vụ': formatCell(htt),
      'Hoàn thành nhiệm vụ': formatCell(ht),
      'Không hoàn thành nhiệm vụ': formatCell(kht),
      'Mức đạt đa số': majority ? SHORT_TO_RATING[majority] : 'Chưa có phiếu',
    };
  });

  const wsResult = XLSX.utils.json_to_sheet(
    resultRows.length > 0
      ? resultRows
      : [{ STT: '', 'Thông báo': 'Chưa có đối tượng trong phiên bỏ phiếu' }]
  );
  wsResult['!cols'] = isMau4
    ? [
        { wch: 6 },
        { wch: 36 },
        { wch: 20 },
        { wch: 24 },
        { wch: 22 },
        { wch: 20 },
        { wch: 24 },
        { wch: 28 },
      ]
    : [
        { wch: 6 },
        { wch: 28 },
        { wch: 16 },
        { wch: 16 },
        { wch: 24 },
        { wch: 22 },
        { wch: 20 },
        { wch: 24 },
        { wch: 28 },
      ];

  // Sheet 2: Thông tin phiên họp
  const infoRows = [
    { 'Hạng mục': 'Tên phiên bỏ phiếu', 'Thông tin': session.title },
    {
      'Hạng mục': 'Loại phiên',
      'Thông tin': VOTING_CATEGORY_META[session.category].label,
    },
    {
      'Hạng mục': 'Biểu mẫu áp dụng',
      'Thông tin': isMau4
        ? 'Mẫu 4 – Phiếu biểu quyết tập thể'
        : 'Mẫu 5 – Phiếu biểu quyết đảng viên, cán bộ lãnh đạo',
    },
    { 'Hạng mục': 'Đơn vị tổ chức', 'Thông tin': session.unitName },
    { 'Hạng mục': 'Năm đánh giá', 'Thông tin': String(session.year) },
    {
      'Hạng mục': 'Ngày họp',
      'Thông tin': session.meetingDate ? formatDateVN(session.meetingDate) : '—',
    },
    {
      'Hạng mục': 'Tổng cử tri thuộc diện bỏ phiếu',
      'Thông tin': String(session.eligibleVoters.length),
    },
    {
      'Hạng mục': 'Số đồng chí đã điểm danh bỏ phiếu',
      'Thông tin': String(attendanceCount),
    },
    {
      'Hạng mục': 'Tổng số phiếu hợp lệ thu về',
      'Thông tin': String(totalBallots),
    },
    {
      'Hạng mục': 'Thời điểm chốt kiểm phiếu',
      'Thông tin': session.closedAt ? formatDateTimeVN(session.closedAt) : '—',
    },
  ];

  const wsInfo = XLSX.utils.json_to_sheet(infoRows);
  wsInfo['!cols'] = [{ wch: 34 }, { wch: 50 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResult, 'Kết quả kiểm phiếu');

  if (isMultiBranchCollectiveSession(session)) {
    const ranking = computeBranchRanking(session, tally);
    const rankRows = ranking.rankedBranches.map((item) => ({
      'Hạng': item.rank,
      'Tên Chi bộ': item.candidate.name,
      'Tự nhận mức': item.candidate.selfRatingShort || '—',
      'Số phiếu HTXSNV': item.htxsnvCount,
      'Tỷ lệ HTXSNV (%)': `${item.htxsnvPercent.toFixed(1)}%`,
      'Số phiếu HTTNV': item.httnvCount,
      'Nhận xét':
        ranking.clearWinner?.candidate.id === item.candidate.id
          ? 'Dẫn đầu đạt quá bán (>50%) – Đề nghị HTXSNV'
          : item.isTopHtxsnv && ranking.tiedLeaders.length > 1
            ? 'Đồng phiếu HTXSNV cao nhất (cần xem xét vòng 2)'
            : item.hasMajorityHtxsnv
              ? 'Đạt >50% HTXSNV'
              : 'Chưa đạt quá bán HTXSNV',
    }));
    const wsRank = XLSX.utils.json_to_sheet(rankRows);
    wsRank['!cols'] = [
      { wch: 8 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 44 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRank, 'Xếp hạng Chi bộ');
  }

  XLSX.utils.book_append_sheet(wb, wsInfo, 'Thông tin phiên họp');

  const safeUnit = session.unitKey.replace(/[^a-z0-9_-]/gi, '');
  const templateTag = isMau4 ? 'Mau4' : 'Mau5';
  const fileName = `Ket_qua_kiem_phieu_${templateTag}_${safeUnit}_${session.year}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

