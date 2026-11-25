import {
  BranchUnitKey,
  BranchUnitName,
  DocumentItem,
  Dossier,
  PositionGroup,
  UNIT_KEY_MAP,
  UnitName,
} from '../types';

export const DEFAULT_YEAR = 2026;

export const DEFAULT_BRANCH_PASSWORDS: Record<
  BranchUnitKey,
  { unitName: BranchUnitName; password: string; hintLabel: string }
> = {
  cb1: {
    unitName: 'Chi bộ 1',
    password: 'cb1@2026',
    hintLabel: 'Mật khẩu mặc định khởi tạo (cb1@2026)',
  },
  cb2: {
    unitName: 'Chi bộ 2',
    password: 'cb2@2026',
    hintLabel: 'Mật khẩu mặc định khởi tạo (cb2@2026)',
  },
  cb3: {
    unitName: 'Chi bộ 3',
    password: 'cb3@2026',
    hintLabel: 'Mật khẩu mặc định khởi tạo (cb3@2026)',
  },
  cb4: {
    unitName: 'Chi bộ 4',
    password: 'cb4@2026',
    hintLabel: 'Mật khẩu mặc định khởi tạo (cb4@2026)',
  },
};

export function createCollectiveDocuments(
  unit: UnitName,
  year: number
): DocumentItem[] {
  if (unit === 'Đảng bộ trường') {
    return [
      {
        key: 'col_bc_kiem_diem_dang_bo',
        title: 'Báo cáo kiểm điểm Ban Chấp hành Đảng bộ Trường THPT Thanh Hoà',
        description:
          'Báo cáo kiểm điểm tự phê bình và phê bình của tập thể cấp uỷ, Ban Chấp hành Đảng bộ cuối năm.',
        requirement: 'Bắt buộc',
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_phu_luc_7_2',
        title:
          'Phụ lục 7.2 – Khung tiêu chí đánh giá, xếp loại dành cho đơn vị sự nghiệp công lập',
        description:
          'Biểu chấm điểm, tự đánh giá theo khung tiêu chí dành cho đơn vị sự nghiệp công lập.',
        requirement: 'Bắt buộc',
        supportsFormVersion: true,
        formVersion: `Năm ${year}`,
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_bien_ban_hoi_nghi',
        title: 'Biên bản hội nghị kiểm điểm, đánh giá, xếp loại tập thể Đảng bộ',
        description:
          'Biên bản họp kiểm điểm cuối năm của Ban Chấp hành Đảng bộ có đầy đủ chữ ký.',
        requirement: 'Bắt buộc',
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_tong_hop_bieu_quyet',
        title: 'Biên bản kiểm phiếu / Tổng hợp kết quả biểu quyết xếp loại',
        description:
          'Kết quả bỏ phiếu đề nghị mức xếp loại chất lượng tập thể Đảng bộ.',
        requirement: 'Theo trường hợp',
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_minh_chung',
        title: 'Tài liệu minh chứng kèm theo (nếu có)',
        description:
          'Các văn bản minh chứng thành tích, khắc phục hạn chế hoặc báo cáo chuyên đề.',
        requirement: 'Theo trường hợp',
        applicableGroup: 'all',
        attachments: [],
      },
    ];
  }

  if (unit === 'UBKT Đảng uỷ') {
    return [
      {
        key: 'col_bc_kiem_diem_ubkt',
        title: 'Báo cáo kiểm điểm tập thể UBKT Đảng uỷ',
        description:
          'Báo cáo kiểm điểm tự phê bình và phê bình của tập thể Ủy ban Kiểm tra Đảng uỷ cuối năm.',
        requirement: 'Bắt buộc',
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_bc_ktgs',
        title: 'Báo cáo kết quả công tác kiểm tra, giám sát năm',
        description:
          'Tổng hợp kết quả thực hiện chương trình kiểm tra, giám sát và thi hành kỷ luật Đảng.',
        requirement: 'Bắt buộc',
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_bien_ban_ubkt',
        title: 'Biên bản hội nghị kiểm điểm, đánh giá tập thể UBKT Đảng uỷ',
        description:
          'Biên bản họp kiểm điểm cuối năm của UBKT Đảng uỷ có đầy đủ chữ ký theo quy định.',
        requirement: 'Bắt buộc',
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_phu_luc_7_2',
        title:
          'Phụ lục 7.2 – Khung tiêu chí đánh giá, xếp loại (nếu áp dụng)',
        description:
          'Cho phép ghi năm hoặc phiên bản biểu mẫu sử dụng, hoặc chuyển sang Không áp dụng.',
        requirement: 'Theo trường hợp',
        supportsFormVersion: true,
        formVersion: `Năm ${year}`,
        applicableGroup: 'all',
        attachments: [],
      },
      {
        key: 'col_minh_chung',
        title: 'Tài liệu minh chứng kèm theo (nếu có)',
        description:
          'Hồ sơ, phụ lục thống kê hoặc tài liệu minh chứng bổ sung của UBKT Đảng uỷ.',
        requirement: 'Theo trường hợp',
        applicableGroup: 'all',
        attachments: [],
      },
    ];
  }

  return [
    {
      key: 'col_bc_kiem_diem',
      title: 'Báo cáo kiểm điểm tập thể chi bộ',
      description:
        'Báo cáo kiểm điểm tự phê bình và phê bình của tập thể chi bộ cuối năm.',
      requirement: 'Bắt buộc',
      applicableGroup: 'all',
      attachments: [],
    },
    {
      key: 'col_phu_luc_7_2',
      title:
        'Phụ lục 7.2 – Khung tiêu chí đánh giá, xếp loại dành cho đơn vị sự nghiệp công lập',
      description:
        'Biểu chấm điểm, tự đánh giá theo khung tiêu chí dành cho đơn vị sự nghiệp công lập.',
      requirement: 'Bắt buộc',
      supportsFormVersion: true,
      formVersion: `Năm ${year}`,
      applicableGroup: 'all',
      attachments: [],
    },
    {
      key: 'col_bien_ban_hoi_nghi',
      title: 'Biên bản hội nghị kiểm điểm, đánh giá, xếp loại tập thể',
      description:
        'Biên bản họp kiểm điểm cuối năm của chi bộ có đầy đủ chữ ký theo quy định.',
      requirement: 'Bắt buộc',
      applicableGroup: 'all',
      attachments: [],
    },
    {
      key: 'col_tong_hop_bieu_quyet',
      title: 'Biên bản kiểm phiếu / Tổng hợp kết quả biểu quyết xếp loại',
      description:
        'Kết quả bỏ phiếu kín đề nghị mức xếp loại chất lượng tập thể chi bộ.',
      requirement: 'Theo trường hợp',
      applicableGroup: 'all',
      attachments: [],
    },
    {
      key: 'col_minh_chung',
      title: 'Tài liệu minh chứng kèm theo (nếu có)',
      description:
        'Các văn bản minh chứng thành tích, khắc phục hạn chế hoặc báo cáo chuyên đề.',
      requirement: 'Theo trường hợp',
      applicableGroup: 'all',
      attachments: [],
    },
  ];
}

export function createIndividualDocuments(): DocumentItem[] {
  return [
    {
      key: 'ind_mau_02a',
      title: 'Mẫu 02A – Bản kiểm điểm cá nhân (giữ chức vụ lãnh đạo, quản lý)',
      description:
        'Áp dụng cho cá nhân giữ chức vụ lãnh đạo, quản lý; đính kèm tệp đã hoàn thiện.',
      requirement: 'Bắt buộc',
      applicableGroup: 'leader',
      attachments: [],
    },
    {
      key: 'ind_phu_luc_9',
      title:
        'Phụ lục 9 – Phiếu đánh giá, xếp loại chất lượng đối với cá nhân giữ chức vụ lãnh đạo, quản lý',
      description:
        'Dành cho đối tượng giữ chức vụ lãnh đạo, quản lý theo quy định đánh giá cuối năm.',
      requirement: 'Bắt buộc',
      applicableGroup: 'leader',
      attachments: [],
    },
    {
      key: 'ind_mau_02b',
      title:
        'Mẫu 02B – Bản kiểm điểm cá nhân (không giữ chức vụ lãnh đạo, quản lý)',
      description:
        'Áp dụng cho đảng viên không giữ chức vụ lãnh đạo, quản lý; đính kèm tệp đã hoàn thiện.',
      requirement: 'Bắt buộc',
      applicableGroup: 'non-leader',
      attachments: [],
    },
    {
      key: 'ind_phu_luc_10',
      title:
        'Phụ lục 10 – Phiếu đánh giá, xếp loại chất lượng đối với cá nhân không giữ chức vụ lãnh đạo, quản lý',
      description:
        'Phiếu tự đánh giá và kết quả đánh giá theo tiêu chí áp dụng cho đảng viên không giữ chức vụ.',
      requirement: 'Bắt buộc',
      applicableGroup: 'non-leader',
      attachments: [],
    },
    {
      key: 'ind_mau_3_hsdv',
      title: 'Phiếu BSLL – Mẫu 3 (HSĐV), Phiếu bổ sung hồ sơ đảng viên',
      description:
        'Phiếu bổ sung lý lịch / hồ sơ đảng viên hằng năm theo hướng dẫn quản lý hồ sơ đảng viên.',
      requirement: 'Bắt buộc',
      applicableGroup: 'all',
      attachments: [],
    },
    {
      key: 'ind_noi_cu_tru_221',
      title: 'Phiếu nhận xét nơi cư trú (Quy định 221)',
      description:
        'Bản scan PDF hoặc ảnh chụp phiếu nhận xét của cấp uỷ nơi cư trú theo Quy định 221.',
      requirement: 'Bắt buộc',
      applicableGroup: 'all',
      attachments: [],
    },
    {
      key: 'ind_tai_lieu_khac',
      title: 'Tài liệu minh chứng khác (nếu có)',
      description:
        'Giấy khen, quyết định khen thưởng hoặc bản giải trình bổ sung theo yêu cầu.',
      requirement: 'Theo trường hợp',
      applicableGroup: 'all',
      attachments: [],
    },
  ];
}

export function buildIndividualDossier(params: {
  code: string;
  branch: BranchUnitName;
  year: number;
  fullName?: string;
  positionGroup?: PositionGroup;
}): Dossier {
  const now = new Date().toISOString();
  const cleanCode = params.code.trim().toUpperCase();
  return {
    id: `${params.year}_${cleanCode}`,
    code: cleanCode,
    type: 'individual',
    branch: params.branch,
    unitKey: UNIT_KEY_MAP[params.branch],
    year: params.year,
    fullName: (params.fullName ?? '').trim(),
    positionGroup: params.positionGroup ?? '',
    status: 'Chưa nộp',
    selfProposedRating: '',
    branchProposedRating: '',
    officialRating: '',
    documents: createIndividualDocuments(),
    revisionRequests: [],
    history: [],
    updatedAt: now,
  };
}

export function buildCollectiveDossier(unit: UnitName, year: number): Dossier {
  const now = new Date().toISOString();
  const unitKey = UNIT_KEY_MAP[unit];
  let shortCode = 'TT-CB1';
  let displayName = `Tập thể ${unit}`;

  if (unit === 'Đảng bộ trường') {
    shortCode = 'TT-DB';
    displayName = 'Tập thể Đảng bộ Trường THPT Thanh Hoà';
  } else if (unit === 'UBKT Đảng uỷ') {
    shortCode = 'TT-UBKT';
    displayName = 'Tập thể UBKT Đảng uỷ';
  } else {
    const num = unit.replace(/\D+/g, '') || '1';
    shortCode = `TT-CB${num}`;
    displayName = `Tập thể ${unit}`;
  }

  return {
    id: `${year}_${shortCode}`,
    code: shortCode,
    type: 'collective',
    branch: unit,
    unitKey,
    year,
    fullName: displayName,
    positionGroup: '',
    status: 'Chưa nộp',
    selfProposedRating: '',
    branchProposedRating: '',
    officialRating: '',
    documents: createCollectiveDocuments(unit, year),
    revisionRequests: [],
    history: [],
    updatedAt: now,
  };
}

/**
 * Dữ liệu khởi tạo năm 2026 (46 hồ sơ):
 * - 6 hồ sơ tập thể: Đảng bộ trường, Chi bộ 1, Chi bộ 2, Chi bộ 3, Chi bộ 4, UBKT Đảng uỷ
 * - 40 hồ sơ cá nhân: Chi bộ 1 (15), Chi bộ 2 (10), Chi bộ 3 (7), Chi bộ 4 (8)
 */
export function createInitialSeedDossiers(): Dossier[] {
  const dossiers: Dossier[] = [];

  // 6 hồ sơ tập thể
  dossiers.push(buildCollectiveDossier('Đảng bộ trường', DEFAULT_YEAR));
  dossiers.push(buildCollectiveDossier('Chi bộ 1', DEFAULT_YEAR));
  dossiers.push(buildCollectiveDossier('Chi bộ 2', DEFAULT_YEAR));
  dossiers.push(buildCollectiveDossier('Chi bộ 3', DEFAULT_YEAR));
  dossiers.push(buildCollectiveDossier('Chi bộ 4', DEFAULT_YEAR));
  dossiers.push(buildCollectiveDossier('UBKT Đảng uỷ', DEFAULT_YEAR));

  // 40 hồ sơ cá nhân
  const branchSpecs: {
    branch: BranchUnitName;
    prefix: string;
    count: number;
  }[] = [
    { branch: 'Chi bộ 1', prefix: 'CB1', count: 15 },
    { branch: 'Chi bộ 2', prefix: 'CB2', count: 10 },
    { branch: 'Chi bộ 3', prefix: 'CB3', count: 7 },
    { branch: 'Chi bộ 4', prefix: 'CB4', count: 8 },
  ];

  for (const spec of branchSpecs) {
    for (let i = 1; i <= spec.count; i++) {
      const code = `${spec.prefix}-${String(i).padStart(2, '0')}`;
      dossiers.push(
        buildIndividualDossier({
          code,
          branch: spec.branch,
          year: DEFAULT_YEAR,
          fullName: '',
          positionGroup: '',
        })
      );
    }
  }

  return dossiers;
}
