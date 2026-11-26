export const SUPABASE_SETUP_SQL = `-- ============================================================================
-- HỆ THỐNG QUẢN LÝ HỒ SƠ KIỂM ĐIỂM CUỐI NĂM
-- ĐẢNG BỘ TRƯỜNG THPT THANH HOÀ
-- Hướng dẫn: Mở Supabase -> SQL Editor -> New query -> Dán toàn bộ -> bấm Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dossiers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('collective', 'individual')),
  branch TEXT NOT NULL,
  unit_key TEXT NOT NULL CHECK (unit_key IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt')),
  year INTEGER NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  position_group TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (
    status IN (
      'Chưa nộp',
      'Chờ Chi bộ kiểm tra',
      'Đang rà soát',
      'Cần bổ sung',
      'Đã hoàn tất'
    )
  ),
  self_proposed_rating TEXT NOT NULL DEFAULT '',
  branch_proposed_rating TEXT NOT NULL DEFAULT '',
  official_rating TEXT NOT NULL DEFAULT '',
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dossiers_year_unit ON public.dossiers (year, unit_key);
CREATE INDEX IF NOT EXISTS idx_dossiers_type_status ON public.dossiers (type, status);

CREATE TABLE IF NOT EXISTS public.branch_access (
  unit_key TEXT PRIMARY KEY CHECK (unit_key IN ('cb1', 'cb2', 'cb3', 'cb4')),
  unit_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  hint_label TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dossiers_select_all" ON public.dossiers;
CREATE POLICY "dossiers_select_all"
  ON public.dossiers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "dossiers_admin_insert" ON public.dossiers;
CREATE POLICY "dossiers_admin_insert"
  ON public.dossiers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dossiers_admin_update" ON public.dossiers;
CREATE POLICY "dossiers_admin_update"
  ON public.dossiers FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dossiers_admin_delete" ON public.dossiers;
CREATE POLICY "dossiers_admin_delete"
  ON public.dossiers FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "branch_access_admin_all" ON public.branch_access;
CREATE POLICY "branch_access_admin_all"
  ON public.branch_access FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.verify_branch_login(
  p_unit_key TEXT,
  p_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash TEXT;
BEGIN
  IF p_unit_key NOT IN ('cb1', 'cb2', 'cb3', 'cb4') THEN
    RETURN jsonb_build_object('ok', false, 'not_initialized', false);
  END IF;

  SELECT password_hash INTO v_stored_hash
  FROM public.branch_access
  WHERE unit_key = p_unit_key;

  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'not_initialized', true);
  END IF;

  RETURN jsonb_build_object(
    'ok', (v_stored_hash = p_password_hash),
    'not_initialized', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.member_update_dossier(
  p_dossier_id TEXT,
  p_position_group TEXT,
  p_self_rating TEXT,
  p_documents JSONB,
  p_status TEXT,
  p_revision_requests JSONB,
  p_history JSONB,
  p_updated_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dossiers%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.dossiers
  WHERE id = p_dossier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ cá nhân.';
  END IF;

  IF v_row.type <> 'individual' THEN
    RAISE EXCEPTION 'Cổng Đảng viên chỉ được phép cập nhật hồ sơ cá nhân.';
  END IF;

  IF v_row.status NOT IN ('Chưa nộp', 'Chờ Chi bộ kiểm tra', 'Cần bổ sung') THEN
    RAISE EXCEPTION 'Hồ sơ đã được chuyển lên Đảng uỷ hoặc đã hoàn tất, không thể chỉnh sửa.';
  END IF;

  IF p_status NOT IN ('Chưa nộp', 'Chờ Chi bộ kiểm tra', 'Cần bổ sung') THEN
    RAISE EXCEPTION 'Trạng thái chuyển đổi không hợp lệ đối với Đảng viên.';
  END IF;

  IF p_status = 'Cần bổ sung' AND v_row.status <> 'Cần bổ sung' THEN
    RAISE EXCEPTION 'Đảng viên không thể tự đặt trạng thái Cần bổ sung.';
  END IF;

  IF p_position_group NOT IN ('', 'Giữ chức vụ lãnh đạo, quản lý', 'Không giữ chức vụ lãnh đạo, quản lý') THEN
    RAISE EXCEPTION 'Nhóm chức vụ không hợp lệ.';
  END IF;

  IF p_self_rating NOT IN (
    '',
    'Hoàn thành xuất sắc nhiệm vụ',
    'Hoàn thành tốt nhiệm vụ',
    'Hoàn thành nhiệm vụ',
    'Không hoàn thành nhiệm vụ'
  ) THEN
    RAISE EXCEPTION 'Mức tự đề xuất không hợp lệ.';
  END IF;

  UPDATE public.dossiers
  SET
    position_group = p_position_group,
    self_proposed_rating = p_self_rating,
    documents = COALESCE(p_documents, '[]'::jsonb),
    status = p_status,
    revision_requests = COALESCE(p_revision_requests, '[]'::jsonb),
    history = COALESCE(p_history, '[]'::jsonb),
    updated_at = COALESCE(p_updated_at, NOW())
  WHERE id = p_dossier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_update_dossier(
  p_dossier_id TEXT,
  p_branch_proof TEXT,
  p_full_name TEXT,
  p_position_group TEXT,
  p_self_rating TEXT,
  p_branch_rating TEXT,
  p_documents JSONB,
  p_status TEXT,
  p_revision_requests JSONB,
  p_history JSONB,
  p_updated_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dossiers%ROWTYPE;
  v_stored_hash TEXT;
BEGIN
  SELECT * INTO v_row
  FROM public.dossiers
  WHERE id = p_dossier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ.';
  END IF;

  IF v_row.unit_key NOT IN ('cb1', 'cb2', 'cb3', 'cb4') THEN
    RAISE EXCEPTION 'Đầu mối Chi bộ không có quyền sửa hồ sơ của Đảng bộ hoặc UBKT.';
  END IF;

  IF v_row.status = 'Đã hoàn tất' THEN
    RAISE EXCEPTION 'Hồ sơ đã được Đảng uỷ chốt kết quả chính thức và đã khoá chỉnh sửa.';
  END IF;

  SELECT password_hash INTO v_stored_hash
  FROM public.branch_access
  WHERE unit_key = v_row.unit_key;

  IF v_stored_hash IS NULL OR v_stored_hash <> p_branch_proof THEN
    RAISE EXCEPTION 'Phiên đăng nhập Đầu mối Chi bộ không hợp lệ hoặc mật khẩu đã thay đổi.';
  END IF;

  IF p_status NOT IN ('Chưa nộp', 'Chờ Chi bộ kiểm tra', 'Đang rà soát', 'Cần bổ sung') THEN
    RAISE EXCEPTION 'Đầu mối Chi bộ không được phép chốt trạng thái Đã hoàn tất.';
  END IF;

  IF p_position_group NOT IN ('', 'Giữ chức vụ lãnh đạo, quản lý', 'Không giữ chức vụ lãnh đạo, quản lý') THEN
    RAISE EXCEPTION 'Nhóm chức vụ không hợp lệ.';
  END IF;

  IF p_self_rating NOT IN (
    '',
    'Hoàn thành xuất sắc nhiệm vụ',
    'Hoàn thành tốt nhiệm vụ',
    'Hoàn thành nhiệm vụ',
    'Không hoàn thành nhiệm vụ'
  ) OR p_branch_rating NOT IN (
    '',
    'Hoàn thành xuất sắc nhiệm vụ',
    'Hoàn thành tốt nhiệm vụ',
    'Hoàn thành nhiệm vụ',
    'Không hoàn thành nhiệm vụ'
  ) THEN
    RAISE EXCEPTION 'Mức đề xuất xếp loại không hợp lệ.';
  END IF;

  UPDATE public.dossiers
  SET
    full_name = COALESCE(p_full_name, ''),
    position_group = p_position_group,
    self_proposed_rating = p_self_rating,
    branch_proposed_rating = p_branch_rating,
    documents = COALESCE(p_documents, '[]'::jsonb),
    status = p_status,
    revision_requests = COALESCE(p_revision_requests, '[]'::jsonb),
    history = COALESCE(p_history, '[]'::jsonb),
    updated_at = COALESCE(p_updated_at, NOW())
  WHERE id = p_dossier_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_branch_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_update_dossier(TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, JSONB, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_update_dossier(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, JSONB, TIMESTAMPTZ) TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dossiers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dossiers;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ho-so-kiem-diem', 'ho-so-kiem-diem', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 26214400;

DROP POLICY IF EXISTS "ho_so_storage_select" ON storage.objects;
CREATE POLICY "ho_so_storage_select"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'ho-so-kiem-diem');

DROP POLICY IF EXISTS "ho_so_storage_insert" ON storage.objects;
CREATE POLICY "ho_so_storage_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'ho-so-kiem-diem'
    AND lower(storage.extension(name)) IN ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png')
  );

DROP POLICY IF EXISTS "ho_so_storage_delete" ON storage.objects;
CREATE POLICY "ho_so_storage_delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'ho-so-kiem-diem');
`;
