import {
  DEFAULT_BRANCH_PASSWORDS,
  createInitialSeedDossiers,
} from '../data/seedData';
import { STORAGE_BUCKET, isSupabaseConfigured, supabase } from '../supabase';
import {
  ALLOWED_EXTENSIONS,
  AttachmentMeta,
  BranchAccessRecord,
  BranchUnitKey,
  BranchUnitName,
  DocumentItem,
  Dossier,
  DossierStatus,
  DossierType,
  HistoryEntry,
  PositionGroup,
  RatingLevel,
  RevisionRequest,
  StoredFileRecord,
  UNIT_NAME_BY_KEY,
  UnitKey,
  UnitName,
} from '../types';

interface DossierDbRow {
  id: string;
  code: string;
  type: DossierType;
  branch: UnitName;
  unit_key: UnitKey;
  year: number;
  full_name: string;
  position_group: PositionGroup;
  status: DossierStatus;
  self_proposed_rating: RatingLevel;
  branch_proposed_rating: RatingLevel;
  official_rating: RatingLevel;
  documents: DocumentItem[];
  revision_requests: RevisionRequest[];
  history: HistoryEntry[];
  updated_at: string;
}

interface BranchAccessDbRow {
  unit_key: BranchUnitKey;
  unit_name: BranchUnitName;
  password_hash: string;
  hint_label: string;
  updated_at: string;
}

const UNIT_SORT_ORDER: Record<UnitKey, number> = {
  'dang-bo': 0,
  cb1: 1,
  cb2: 2,
  cb3: 3,
  cb4: 4,
  ubkt: 5,
};

function sortDossiers(list: Dossier[]): Dossier[] {
  return [...list].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.type !== b.type) return a.type === 'collective' ? -1 : 1;
    const ua = UNIT_SORT_ORDER[a.unitKey] ?? 99;
    const ub = UNIT_SORT_ORDER[b.unitKey] ?? 99;
    if (ua !== ub) return ua - ub;
    return a.code.localeCompare(b.code, 'vi', { numeric: true });
  });
}

function rowToDossier(row: DossierDbRow): Dossier {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    branch: row.branch,
    unitKey: row.unit_key,
    year: row.year,
    fullName: row.full_name ?? '',
    positionGroup: (row.position_group ?? '') as PositionGroup,
    status: row.status,
    selfProposedRating: (row.self_proposed_rating ?? '') as RatingLevel,
    branchProposedRating: (row.branch_proposed_rating ?? '') as RatingLevel,
    officialRating: (row.official_rating ?? '') as RatingLevel,
    documents: Array.isArray(row.documents) ? row.documents : [],
    revisionRequests: Array.isArray(row.revision_requests)
      ? row.revision_requests
      : [],
    history: Array.isArray(row.history) ? row.history : [],
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function dossierToRow(d: Dossier): DossierDbRow {
  return {
    id: d.id,
    code: d.code,
    type: d.type,
    branch: d.branch,
    unit_key: d.unitKey,
    year: d.year,
    full_name: d.fullName ?? '',
    position_group: d.positionGroup ?? '',
    status: d.status,
    self_proposed_rating: d.selfProposedRating ?? '',
    branch_proposed_rating: d.branchProposedRating ?? '',
    official_rating: d.officialRating ?? '',
    documents: d.documents ?? [],
    revision_requests: d.revisionRequests ?? [],
    history: d.history ?? [],
    updated_at: d.updatedAt || new Date().toISOString(),
  };
}

export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('relation "public.dossiers"')
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeStorageSegment(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 80);
}

export async function fetchAllDossiers(): Promise<Dossier[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.');
  }
  const { data, error } = await supabase.from('dossiers').select('*');
  if (error) {
    throw error;
  }
  return sortDossiers(((data ?? []) as DossierDbRow[]).map(rowToDossier));
}

export function subscribeDossiersRealtime(
  onChange: (dossiers: Dossier[]) => void,
  onError: (err: unknown) => void
): () => void {
  let active = true;

  const refresh = async () => {
    try {
      const list = await fetchAllDossiers();
      if (active) {
        onChange(list);
      }
    } catch (err) {
      if (active) {
        onError(err);
      }
    }
  };

  void refresh();

  if (!isSupabaseConfigured) {
    return () => {
      active = false;
    };
  }

  const channel = supabase
    .channel('dossiers-realtime-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dossiers' },
      () => {
        void refresh();
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function ensureSupabaseSeededByAdmin(): Promise<{
  seededDossiersCount: number;
  seededAccessCount: number;
}> {
  let seededDossiersCount = 0;
  let seededAccessCount = 0;

  const { data: existingDossiers, error: fetchErr } = await supabase
    .from('dossiers')
    .select('id');
  if (fetchErr) throw fetchErr;

  const existingIds = new Set(
    ((existingDossiers ?? []) as { id: string }[]).map((r) => r.id)
  );
  const seedList = createInitialSeedDossiers();
  const missingRows = seedList
    .filter((d) => !existingIds.has(d.id))
    .map(dossierToRow);

  if (missingRows.length > 0) {
    const { error: insertErr } = await supabase
      .from('dossiers')
      .upsert(missingRows, { onConflict: 'id', ignoreDuplicates: true });
    if (insertErr) throw insertErr;
    seededDossiersCount = missingRows.length;
  }

  const { data: existingAccess, error: accessFetchErr } = await supabase
    .from('branch_access')
    .select('unit_key');
  if (accessFetchErr) throw accessFetchErr;

  const existingUnitKeys = new Set(
    ((existingAccess ?? []) as { unit_key: string }[]).map((r) => r.unit_key)
  );

  const branchKeys: BranchUnitKey[] = ['cb1', 'cb2', 'cb3', 'cb4'];
  const missingAccessRows: BranchAccessDbRow[] = [];

  for (const unitKey of branchKeys) {
    if (!existingUnitKeys.has(unitKey)) {
      const def = DEFAULT_BRANCH_PASSWORDS[unitKey];
      const hash = await sha256Hex(def.password);
      missingAccessRows.push({
        unit_key: unitKey,
        unit_name: UNIT_NAME_BY_KEY[unitKey] as BranchUnitName,
        password_hash: hash,
        hint_label: def.hintLabel,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (missingAccessRows.length > 0) {
    const { error: accessInsertErr } = await supabase
      .from('branch_access')
      .upsert(missingAccessRows, {
        onConflict: 'unit_key',
        ignoreDuplicates: true,
      });
    if (accessInsertErr) throw accessInsertErr;
    seededAccessCount = missingAccessRows.length;
  }

  return { seededDossiersCount, seededAccessCount };
}

export async function verifyBranchPassword(
  unitKey: BranchUnitKey,
  passwordPlain: string
): Promise<{ ok: boolean; hash: string; notInitialized?: boolean }> {
  const hash = await sha256Hex(passwordPlain.trim());
  const { data, error } = await supabase.rpc('verify_branch_login', {
    p_unit_key: unitKey,
    p_password_hash: hash,
  });

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, hash, notInitialized: true };
    }
    throw error;
  }

  const result = (data ?? {}) as { ok?: boolean; not_initialized?: boolean };
  return {
    ok: Boolean(result.ok),
    hash,
    notInitialized: Boolean(result.not_initialized),
  };
}

export async function fetchAllBranchAccess(): Promise<BranchAccessRecord[]> {
  const { data, error } = await supabase
    .from('branch_access')
    .select('*')
    .order('unit_key', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as BranchAccessDbRow[]).map((row) => ({
    unitKey: row.unit_key,
    unitName: row.unit_name,
    passwordHash: row.password_hash,
    hintLabel: row.hint_label,
    updatedAt: row.updated_at,
  }));
}

export async function updateBranchAccessPassword(
  unitKey: BranchUnitKey,
  unitName: BranchUnitName,
  newPlainPassword: string,
  hintLabel: string
): Promise<BranchAccessRecord> {
  const passwordHash = await sha256Hex(newPlainPassword.trim());
  const now = new Date().toISOString();

  const { error } = await supabase.from('branch_access').upsert(
    {
      unit_key: unitKey,
      unit_name: unitName,
      password_hash: passwordHash,
      hint_label: hintLabel,
      updated_at: now,
    },
    { onConflict: 'unit_key' }
  );
  if (error) throw error;

  return {
    unitKey,
    unitName,
    passwordHash,
    hintLabel,
    updatedAt: now,
  };
}

export async function saveDossierAsMember(dossier: Dossier): Promise<void> {
  const { error } = await supabase.rpc('member_update_dossier', {
    p_dossier_id: dossier.id,
    p_position_group: dossier.positionGroup ?? '',
    p_self_rating: dossier.selfProposedRating ?? '',
    p_documents: dossier.documents ?? [],
    p_status: dossier.status,
    p_revision_requests: dossier.revisionRequests ?? [],
    p_history: dossier.history ?? [],
    p_updated_at: dossier.updatedAt || new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveDossierAsBranch(
  dossier: Dossier,
  branchProof: string
): Promise<void> {
  const { error } = await supabase.rpc('branch_update_dossier', {
    p_dossier_id: dossier.id,
    p_branch_proof: branchProof,
    p_full_name: dossier.fullName ?? '',
    p_position_group: dossier.positionGroup ?? '',
    p_self_rating: dossier.selfProposedRating ?? '',
    p_branch_rating: dossier.branchProposedRating ?? '',
    p_documents: dossier.documents ?? [],
    p_status: dossier.status,
    p_revision_requests: dossier.revisionRequests ?? [],
    p_history: dossier.history ?? [],
    p_updated_at: dossier.updatedAt || new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveDossierAsAdmin(dossier: Dossier): Promise<void> {
  const { error } = await supabase
    .from('dossiers')
    .upsert(dossierToRow(dossier), { onConflict: 'id' });
  if (error) throw error;
}

export async function saveManyDossiersAsAdmin(
  dossiers: Dossier[]
): Promise<void> {
  if (dossiers.length === 0) return;
  const rows = dossiers.map(dossierToRow);
  const { error } = await supabase
    .from('dossiers')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function resetAllDataAsAdmin(): Promise<void> {
  // 1. Collect storage paths of existing attachments to clean up Storage bucket
  const existing = await fetchAllDossiers();
  const storagePaths: string[] = [];
  for (const d of existing) {
    for (const docItem of d.documents) {
      for (const att of docItem.attachments) {
        if (att.storagePath) {
          storagePaths.push(att.storagePath);
        }
      }
    }
  }

  if (storagePaths.length > 0) {
    // Supabase Storage remove supports arrays; chunk by 100
    for (let i = 0; i < storagePaths.length; i += 100) {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storagePaths.slice(i, i + 100));
    }
  }

  // 2. Delete all rows in dossiers then re-insert clean 46 dossiers for 2026
  const { error: delErr } = await supabase
    .from('dossiers')
    .delete()
    .neq('id', '');
  if (delErr) throw delErr;

  const freshRows = createInitialSeedDossiers().map(dossierToRow);
  const { error: insErr } = await supabase
    .from('dossiers')
    .upsert(freshRows, { onConflict: 'id' });
  if (insErr) throw insErr;
}

// ============================================================
// SUPABASE STORAGE: UPLOAD / DOWNLOAD / DELETE ATTACHMENTS
// Organized by folder: {year}/{unitKey}/{code}/{docKey}/{fileId}_{safeName}
// ============================================================

export async function uploadFileToSupabaseStorage(params: {
  file: File;
  fileId: string;
  dossier: Dossier;
  docKey: string;
  extension: string;
}): Promise<string> {
  const { file, fileId, dossier, docKey, extension } = params;
  const normalizedExt = extension.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(normalizedExt)) {
    throw new Error('Định dạng tệp không được phép tải lên.');
  }

  const safeCode = sanitizeStorageSegment(dossier.code) || 'HS';
  const safeDocKey = sanitizeStorageSegment(docKey) || 'doc';
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const safeFileBase = sanitizeStorageSegment(baseName) || 'tep_dinh_kem';
  const storagePath = `${dossier.year}/${dossier.unitKey}/${safeCode}/${safeDocKey}/${fileId}_${safeFileBase}.${normalizedExt}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return storagePath;
}

export async function downloadFileFromSupabaseStorage(
  meta: AttachmentMeta,
  dossierId: string,
  docKey: string
): Promise<StoredFileRecord | null> {
  if (!meta.storagePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(meta.storagePath);

  if (error || !data) {
    throw error ?? new Error('Không tìm thấy tệp trên Supabase Storage.');
  }

  const typedBlob =
    data.type || !meta.mimeType
      ? data
      : new Blob([data], { type: meta.mimeType });

  return {
    id: meta.id,
    dossierId,
    docKey,
    name: meta.name,
    size: meta.size,
    mimeType: meta.mimeType,
    extension: meta.extension,
    uploadedAt: meta.uploadedAt,
    uploadedByLabel: meta.uploadedByRole,
    blob: typedBlob,
  };
}

export async function deleteFileFromSupabaseStorage(
  storagePath?: string
): Promise<void> {
  if (!storagePath) return;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath]);
  if (error) {
    // Ignore not-found during cleanup, throw real permission/network errors
    console.warn('Storage delete warning:', error.message);
  }
}
