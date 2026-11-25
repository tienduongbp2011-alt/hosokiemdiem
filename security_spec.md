# Security Specification – Quản lý hồ sơ kiểm điểm cuối năm (Đảng bộ Trường THPT Thanh Hoà)

## 1. Data Invariants

1. **Default Deny**: Any unmatched Firestore path is denied for read and write.
2. **Admin Exclusivity**: Only verified Party Committee administrators (`request.auth.token.email_verified == true` matching bootstrapped admin email `tienduongbp2011@gmail.com` or an existing `/admins/{uid}` document) may:
   - Create or delete dossiers
   - Modify `officialRating`
   - Transition a dossier to or from terminal state `Đã hoàn tất`
   - Create, update, or delete `/branch_access/{unitKey}` credentials
   - Create or modify `/admins/{adminUid}` records
3. **Branch Focal Point Isolation**: A branch focal point (`cb1`, `cb2`, `cb3`, `cb4`) may only update dossiers belonging to its own `unitKey`, must present a valid `branchProof` matching `/branch_access/{unitKey}.passwordHash`, cannot touch `dang-bo` or `ubkt` collective dossiers, cannot modify `officialRating`, and cannot edit any dossier already in terminal state `Đã hoàn tất`.
4. **Party Member Portal Scoped Access**: A party member updating via the passwordless name-selection portal may ONLY update `type == 'individual'` dossiers currently in `['Chưa nộp', 'Chờ Chi bộ kiểm tra', 'Cần bổ sung']`, may ONLY transition status within `['Chưa nộp', 'Chờ Chi bộ kiểm tra']`, and may ONLY touch `['positionGroup', 'selfProposedRating', 'documents', 'status', 'history', 'revisionRequests', 'updatedAt']`. They cannot modify `officialRating`, `branchProposedRating`, `fullName`, `code`, `branch`, `unitKey`, or `year`.
5. **Terminal State Locking**: Once `status == 'Đã hoàn tất'`, non-admin writes to the dossier and its `file_chunks` are unconditionally rejected.
6. **File Chunk Relational Integrity**: Every `file_chunks/{chunkId}` create/delete checks that the parent `/dossiers/{dossierId}` exists, validates allowed file extensions (`pdf`, `doc`, `docx`, `xls`, `xlsx`, `jpg`, `jpeg`, `png`), enforces max chunk payload (`<= 700000` chars) and max total file size (`<= 8388608` bytes), and denies mutations if the parent dossier is locked (`Đã hoàn tất`) unless `isAdmin()`.
7. **Schema & Size Guarding**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars); all strings and arrays enforce explicit upper bounds; shadow/unknown keys are rejected via `hasOnly()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Shadow Field Injection on Dossier Update**: Party member sends `isAdmin: true` alongside `selfProposedRating`.
2. **Official Rating Escalation by Party Member**: Party member tries to set `officialRating: "Hoàn thành xuất sắc nhiệm vụ"`.
3. **Status Shortcutting by Party Member**: Party member attempts to jump status directly to `Đã hoàn tất` or `Đang rà soát`.
4. **Collective Dossier Tampering by Party Member**: Unauthenticated client tries to update `2026_TT-DB` (`type: "collective"`).
5. **Terminal State Violation**: Party member or branch focal point tries to modify a dossier whose `status` is `Đã hoàn tất`.
6. **Cross-Branch Escalation**: Branch focal point with `cb1` `branchProof` tries to update a `cb2` dossier (`unitKey: "cb2"`).
7. **Branch Focal Point Finalizing Official Rating**: Branch focal point tries to modify `officialRating` or set `status: "Đã hoàn tất"`.
8. **Branch Access Credential Tampering**: Non-admin tries to overwrite `/branch_access/cb1` password hash or list `/branch_access`.
9. **Unverified Admin Email Spoof**: Authenticated user with `email: "tienduongbp2011@gmail.com"` and `email_verified: false` attempts admin write.
10. **Orphaned File Chunk Creation**: Client tries to create a `file_chunks` doc referencing a non-existent `dossierId: "fake_999"`.
11. **Disallowed File Extension / Oversized Payload**: Client tries to upload an `.exe` file chunk or `dataBase64` exceeding `700000` characters.
12. **ID Poisoning**: Client attempts to create/update a document with an invalid ID containing slashes, spaces, or >128 chars.
