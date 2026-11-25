import {
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_BRANCH_PASSWORDS,
  createInitialSeedDossiers,
} from '../data/seedData';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  ALL_UNITS,
  BranchAccessRecord,
  BranchUnitKey,
  BranchUnitName,
  Dossier,
  StoredFileRecord,
} from '../types';

const CHUNK_RAW_BYTES = 450 * 1024; // ~450KB raw -> ~600KB base64 (under 700KB rule limit)

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sortDossiers(dossiers: Dossier[]): Dossier[] {
  const unitOrder = new Map(ALL_UNITS.map((u, idx) => [u, idx]));
  return [...dossiers].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const ua = unitOrder.get(a.branch) ?? 99;
    const ub = unitOrder.get(b.branch) ?? 99;
    if (ua !== ub) return ua - ub;
    if (a.type !== b.type) return a.type === 'collective' ? -1 : 1;
    return a.code.localeCompare(b.code, 'vi', { numeric: true });
  });
}

function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return obj;
}

export function subscribeDossiers(
  onData: (dossiers: Dossier[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'dossiers';
  const q = query(
    collection(db, path),
    where('year', '>=', 2020),
    where('year', '<=', 2100)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Dossier);
      onData(sortDossiers(items));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function ensureFirestoreSeededByAdmin(): Promise<{
  seededDossiersCount: number;
  seededAccessCount: number;
}> {
  let seededDossiersCount = 0;
  let seededAccessCount = 0;

  // 1. Seed missing initial dossiers (46 records: 6 collective + 40 individual)
  const dossiersPath = 'dossiers';
  let existingIds = new Set<string>();
  try {
    const snap = await getDocs(
      query(
        collection(db, dossiersPath),
        where('year', '>=', 2020),
        where('year', '<=', 2100)
      )
    );
    existingIds = new Set(snap.docs.map((d) => d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, dossiersPath);
  }

  const initialSeed = createInitialSeedDossiers();
  const missingDossiers = initialSeed.filter((d) => !existingIds.has(d.id));

  if (missingDossiers.length > 0) {
    try {
      const batch = writeBatch(db);
      for (const dossier of missingDossiers) {
        batch.set(doc(db, dossiersPath, dossier.id), stripUndefined(dossier));
      }
      await batch.commit();
      seededDossiersCount = missingDossiers.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, dossiersPath);
    }
  }

  // 2. Seed default branch access passwords (cb1..cb4) if missing
  const accessPath = 'branch_access';
  const now = new Date().toISOString();
  const unitKeys: BranchUnitKey[] = ['cb1', 'cb2', 'cb3', 'cb4'];

  for (const key of unitKeys) {
    const ref = doc(db, accessPath, key);
    try {
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        const def = DEFAULT_BRANCH_PASSWORDS[key];
        const hash = await sha256Hex(def.password);
        const record: BranchAccessRecord = {
          unitKey: key,
          unitName: def.unitName,
          passwordHash: hash,
          hintLabel: def.hintLabel,
          updatedAt: now,
        };
        await setDoc(ref, record);
        seededAccessCount += 1;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${accessPath}/${key}`);
    }
  }

  return { seededDossiersCount, seededAccessCount };
}

export async function verifyBranchPassword(
  unitKey: BranchUnitKey,
  passwordPlain: string
): Promise<{ ok: boolean; hash: string; notInitialized?: boolean }> {
  const path = `branch_access/${unitKey}`;
  try {
    const snap = await getDoc(doc(db, 'branch_access', unitKey));
    if (!snap.exists()) {
      return { ok: false, hash: '', notInitialized: true };
    }
    const data = snap.data() as BranchAccessRecord;
    const hash = await sha256Hex(passwordPlain.trim());
    return { ok: hash === data.passwordHash, hash };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchAllBranchAccess(): Promise<BranchAccessRecord[]> {
  const path = 'branch_access';
  try {
    const snap = await getDocs(collection(db, path));
    const list = snap.docs.map((d) => d.data() as BranchAccessRecord);
    const order: BranchUnitKey[] = ['cb1', 'cb2', 'cb3', 'cb4'];
    return list.sort(
      (a, b) => order.indexOf(a.unitKey) - order.indexOf(b.unitKey)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateBranchAccessPassword(
  unitKey: BranchUnitKey,
  unitName: BranchUnitName,
  newPasswordPlain: string,
  hintLabel: string
): Promise<BranchAccessRecord> {
  const path = `branch_access/${unitKey}`;
  const hash = await sha256Hex(newPasswordPlain.trim());
  const record: BranchAccessRecord = {
    unitKey,
    unitName,
    passwordHash: hash,
    hintLabel: hintLabel.trim().slice(0, 120),
    updatedAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'branch_access', unitKey), record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveDossierAsMember(dossier: Dossier): Promise<void> {
  const path = `dossiers/${dossier.id}`;
  const payload = stripUndefined({
    positionGroup: dossier.positionGroup,
    selfProposedRating: dossier.selfProposedRating,
    documents: dossier.documents,
    status: dossier.status,
    revisionRequests: dossier.revisionRequests,
    history: dossier.history,
    updatedAt: dossier.updatedAt,
  });
  try {
    await updateDoc(doc(db, 'dossiers', dossier.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveDossierAsBranch(
  dossier: Dossier,
  branchProof: string
): Promise<void> {
  const path = `dossiers/${dossier.id}`;
  const payload = stripUndefined({
    fullName: dossier.fullName,
    positionGroup: dossier.positionGroup,
    selfProposedRating: dossier.selfProposedRating,
    branchProposedRating: dossier.branchProposedRating,
    documents: dossier.documents,
    status: dossier.status,
    revisionRequests: dossier.revisionRequests,
    history: dossier.history,
    branchProof,
    updatedAt: dossier.updatedAt,
  });
  try {
    await updateDoc(doc(db, 'dossiers', dossier.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveDossierAsAdmin(dossier: Dossier): Promise<void> {
  const path = `dossiers/${dossier.id}`;
  const clean = stripUndefined({
    ...dossier,
    branchProof: '',
  });
  try {
    await setDoc(doc(db, 'dossiers', dossier.id), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveManyDossiersAsAdmin(
  dossiers: Dossier[]
): Promise<void> {
  const path = 'dossiers';
  try {
    const chunkSize = 400;
    for (let i = 0; i < dossiers.length; i += chunkSize) {
      const slice = dossiers.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const item of slice) {
        const clean = stripUndefined({
          ...item,
          branchProof: '',
        });
        batch.set(doc(db, path, item.id), clean);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function resetAllDataAsAdmin(): Promise<void> {
  // Delete existing dossiers
  try {
    const existingDossiers = await getDocs(
      query(
        collection(db, 'dossiers'),
        where('year', '>=', 2020),
        where('year', '<=', 2100)
      )
    );
    const batchDel = writeBatch(db);
    for (const d of existingDossiers.docs) {
      batchDel.delete(d.ref);
    }
    await batchDel.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'dossiers');
  }

  // Delete existing file chunks
  try {
    const existingChunks = await getDocs(collection(db, 'file_chunks'));
    const chunkDocs = existingChunks.docs;
    for (let i = 0; i < chunkDocs.length; i += 400) {
      const batch = writeBatch(db);
      for (const c of chunkDocs.slice(i, i + 400)) {
        batch.delete(c.ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'file_chunks');
  }

  // Re-seed 46 initial dossiers
  const fresh = createInitialSeedDossiers();
  await saveManyDossiersAsAdmin(fresh);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function uploadFileToFirestore(params: {
  file: File;
  fileId: string;
  dossierId: string;
  docKey: string;
  extension: string;
  uploadedAt: string;
  uploadedByLabel: string;
  branchProof?: string;
}): Promise<void> {
  const {
    file,
    fileId,
    dossierId,
    docKey,
    extension,
    uploadedAt,
    uploadedByLabel,
    branchProof,
  } = params;

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK_RAW_BYTES));

  for (let idx = 0; idx < totalChunks; idx++) {
    const start = idx * CHUNK_RAW_BYTES;
    const end = Math.min(bytes.length, start + CHUNK_RAW_BYTES);
    const slice = bytes.subarray(start, end);
    const dataBase64 = uint8ToBase64(slice);
    const chunkId = `${fileId}_c${idx}`;

    const chunkPayload: Record<string, unknown> = {
      id: chunkId,
      fileId,
      dossierId,
      docKey,
      chunkIndex: idx,
      totalChunks,
      name: file.name.slice(0, 255),
      mimeType: (file.type || 'application/octet-stream').slice(0, 120),
      extension,
      size: file.size,
      dataBase64,
      uploadedAt,
      uploadedByLabel: uploadedByLabel.slice(0, 120),
    };
    if (branchProof) {
      chunkPayload.branchProof = branchProof;
    }

    try {
      await setDoc(doc(db, 'file_chunks', chunkId), chunkPayload);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `file_chunks/${chunkId}`
      );
    }
  }
}

export async function downloadFileFromFirestore(
  fileId: string
): Promise<StoredFileRecord | null> {
  const path = `file_chunks?fileId=${fileId}`;
  try {
    const q = query(
      collection(db, 'file_chunks'),
      where('fileId', '==', fileId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const chunks = snap.docs
      .map((d) => d.data() as Record<string, unknown>)
      .sort(
        (a, b) => Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0)
      );

    const decodedParts = chunks.map((c) =>
      base64ToUint8(String(c.dataBase64 ?? ''))
    );
    const totalLength = decodedParts.reduce((sum, p) => sum + p.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of decodedParts) {
      merged.set(part, offset);
      offset += part.length;
    }

    const first = chunks[0];
    const mimeType = String(first.mimeType ?? 'application/octet-stream');
    const blob = new Blob([merged], { type: mimeType });

    return {
      id: fileId,
      dossierId: String(first.dossierId ?? ''),
      docKey: String(first.docKey ?? ''),
      name: String(first.name ?? 'tai-lieu'),
      size: Number(first.size ?? blob.size),
      mimeType,
      extension: String(first.extension ?? ''),
      uploadedAt: String(first.uploadedAt ?? ''),
      uploadedByLabel: String(first.uploadedByLabel ?? ''),
      blob,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteFileChunksFromFirestore(
  fileId: string
): Promise<void> {
  const path = `file_chunks?fileId=${fileId}`;
  try {
    const q = query(
      collection(db, 'file_chunks'),
      where('fileId', '==', fileId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      try {
        await deleteDoc(d.ref);
      } catch {
        // Non-admin detaching from collective dossier leaves orphan cleanup to Admin
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
