export const SUPABASE_SIX_UNIT_UPGRADE_SQL = `ALTER TABLE public.branch_access DROP CONSTRAINT IF EXISTS branch_access_unit_key_check;
ALTER TABLE public.branch_access ADD CONSTRAINT branch_access_unit_key_check
  CHECK (unit_key IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt'));

INSERT INTO public.branch_access (unit_key, unit_name, password_hash, hint_label, updated_at)
VALUES
  ('dang-bo', 'Đảng bộ trường', 'd79c069c11868acc975e24a1f27c25d98cb7cc5ed1638304625e393bdce092a1', 'Thư ký Đảng bộ trường – Mặc định (dangbo@2026)', NOW()),
  ('ubkt', 'UBKT Đảng uỷ', '134a41affb3514d64e1f7c7690106c9b90c153d8fca72e1f65b4347848443ac9', 'Thư ký UBKT Đảng uỷ – Mặc định (ubkt@2026)', NOW())
ON CONFLICT (unit_key) DO UPDATE SET
  unit_name = EXCLUDED.unit_name,
  password_hash = EXCLUDED.password_hash,
  hint_label = EXCLUDED.hint_label,
  updated_at = NOW();

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
  IF p_unit_key NOT IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt') THEN
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
  SELECT * INTO v_row FROM public.dossiers WHERE id = p_dossier_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy hồ sơ.'; END IF;
  IF v_row.unit_key NOT IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt') THEN
    RAISE EXCEPTION 'Đơn vị không hợp lệ.';
  END IF;
  IF v_row.status = 'Đã hoàn tất' THEN
    RAISE EXCEPTION 'Hồ sơ đã được Đảng uỷ chốt kết quả chính thức và đã khoá chỉnh sửa.';
  END IF;

  SELECT password_hash INTO v_stored_hash FROM public.branch_access WHERE unit_key = v_row.unit_key;
  IF v_stored_hash IS NULL OR v_stored_hash <> p_branch_proof THEN
    RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ hoặc mật khẩu đã thay đổi.';
  END IF;

  IF p_status NOT IN ('Chưa nộp', 'Chờ Chi bộ kiểm tra', 'Đang rà soát', 'Cần bổ sung') THEN
    RAISE EXCEPTION 'Không được phép chốt trạng thái Đã hoàn tất.';
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
$$;`;

export const SUPABASE_VOTING_SQL = `-- PHÂN HỆ BỎ PHIẾU TRỰC TUYẾN (MẪU 4 & MẪU 5) — BỎ PHIẾU KÍN (KHÔNG KÝ TÊN)
CREATE TABLE IF NOT EXISTS public.voting_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('mau4', 'mau5')),
  category TEXT NOT NULL CHECK (
    category IN (
      'collective_branch',
      'collective_party',
      'collective_ubkt',
      'individual_committee',
      'individual_member'
    )
  ),
  unit_key TEXT NOT NULL CHECK (unit_key IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt')),
  unit_name TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  meeting_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  htxsnv_mode TEXT NOT NULL DEFAULT 'warn' CHECK (htxsnv_mode IN ('warn', 'strict', 'off')),
  max_htxsnv_percent INTEGER NOT NULL DEFAULT 20 CHECK (max_htxsnv_percent >= 5 AND max_htxsnv_percent <= 100),
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  eligible_voters JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voting_sessions_status ON public.voting_sessions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.voting_voters (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.voting_sessions(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  voter_name TEXT NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_voting_voters_session ON public.voting_voters (session_id);

CREATE TABLE IF NOT EXISTS public.voting_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES public.voting_sessions(id) ON DELETE CASCADE,
  choices JSONB NOT NULL,
  submitted_bucket TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', NOW())
);

CREATE INDEX IF NOT EXISTS idx_voting_ballots_session ON public.voting_ballots (session_id);

ALTER TABLE public.voting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_ballots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voting_sessions_select_all" ON public.voting_sessions;
CREATE POLICY "voting_sessions_select_all"
  ON public.voting_sessions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "voting_sessions_admin_all" ON public.voting_sessions;
CREATE POLICY "voting_sessions_admin_all"
  ON public.voting_sessions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "voting_voters_select_all" ON public.voting_voters;
CREATE POLICY "voting_voters_select_all"
  ON public.voting_voters FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "voting_voters_admin_delete" ON public.voting_voters;
CREATE POLICY "voting_voters_admin_delete"
  ON public.voting_voters FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "voting_ballots_admin_delete" ON public.voting_ballots;
CREATE POLICY "voting_ballots_admin_delete"
  ON public.voting_ballots FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.cast_secret_ballot(
  p_session_id TEXT,
  p_voter_id TEXT,
  p_voter_name TEXT,
  p_choices JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.voting_sessions%ROWTYPE;
  v_is_eligible BOOLEAN := FALSE;
  v_cand JSONB;
  v_cand_id TEXT;
  v_val TEXT;
  v_total_cands INTEGER := 0;
  v_htxsnv_count INTEGER := 0;
  v_max_allowed INTEGER := 0;
BEGIN
  SELECT * INTO v_session FROM public.voting_sessions WHERE id = p_session_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bỏ phiếu.'; END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Phiên bỏ phiếu này hiện chưa mở hoặc đã chốt hòm phiếu.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_session.eligible_voters) AS elem
    WHERE elem->>'id' = p_voter_id
  ) INTO v_is_eligible;
  IF NOT v_is_eligible THEN
    RAISE EXCEPTION 'Tên đồng chí không nằm trong danh sách cử tri của phiên bỏ phiếu này.';
  END IF;

  IF p_choices IS NULL OR jsonb_typeof(p_choices) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu phiếu biểu quyết không hợp lệ.';
  END IF;

  FOR v_cand IN SELECT * FROM jsonb_array_elements(v_session.candidates)
  LOOP
    v_total_cands := v_total_cands + 1;
    v_cand_id := v_cand->>'id';
    v_val := p_choices->>v_cand_id;
    IF v_val IS NULL OR v_val NOT IN ('HTXSNV', 'HTTNV', 'HTNV', 'KHTNV') THEN
      RAISE EXCEPTION 'Vui lòng đánh dấu đầy đủ tất cả các dòng trên phiếu trước khi gửi.';
    END IF;
    IF v_val = 'HTXSNV' THEN
      v_htxsnv_count := v_htxsnv_count + 1;
    END IF;
  END LOOP;

  IF v_session.htxsnv_mode = 'strict' AND v_total_cands >= 2 THEN
    v_max_allowed := GREATEST(1, FLOOR(v_total_cands * v_session.max_htxsnv_percent / 100.0)::INTEGER);
    IF v_htxsnv_count > v_max_allowed THEN
      RAISE EXCEPTION 'Số lượng chọn Hoàn thành xuất sắc nhiệm vụ (%) vượt quá giới hạn tối đa % (%).', v_htxsnv_count, v_max_allowed, v_session.max_htxsnv_percent || '%';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.voting_voters (session_id, voter_id, voter_name)
    VALUES (p_session_id, p_voter_id, COALESCE(NULLIF(TRIM(p_voter_name), ''), p_voter_id));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Đồng chí này đã bỏ phiếu trong phiên này rồi (mỗi đồng chí chỉ được bỏ 1 phiếu kín).';
  END;

  INSERT INTO public.voting_ballots (session_id, choices) VALUES (p_session_id, p_choices);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_voting_tally(p_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.voting_sessions%ROWTYPE;
  v_total_ballots INTEGER := 0;
  v_tallies JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_session FROM public.voting_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'draft', 'total_ballots', 0, 'tallies', '{}'::jsonb);
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_total_ballots FROM public.voting_ballots WHERE session_id = p_session_id;
  IF v_session.status <> 'closed' THEN
    RETURN jsonb_build_object('status', v_session.status, 'total_ballots', v_total_ballots, 'tallies', '{}'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      cand_id,
      jsonb_build_object('HTXSNV', htxsnv_cnt, 'HTTNV', httnv_cnt, 'HTNV', htnv_cnt, 'KHTNV', khtnv_cnt)
    ),
    '{}'::jsonb
  ) INTO v_tallies
  FROM (
    SELECT
      kv.key AS cand_id,
      COUNT(*) FILTER (WHERE kv.value = 'HTXSNV')::INTEGER AS htxsnv_cnt,
      COUNT(*) FILTER (WHERE kv.value = 'HTTNV')::INTEGER AS httnv_cnt,
      COUNT(*) FILTER (WHERE kv.value = 'HTNV')::INTEGER AS htnv_cnt,
      COUNT(*) FILTER (WHERE kv.value = 'KHTNV')::INTEGER AS khtnv_cnt
    FROM public.voting_ballots b
    CROSS JOIN LATERAL jsonb_each_text(b.choices) AS kv(key, value)
    WHERE b.session_id = p_session_id
    GROUP BY kv.key
  ) agg;

  RETURN jsonb_build_object('status', 'closed', 'total_ballots', v_total_ballots, 'tallies', v_tallies);
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_upsert_voting_session(
  p_branch_proof TEXT,
  p_id TEXT,
  p_title TEXT,
  p_template TEXT,
  p_category TEXT,
  p_unit_key TEXT,
  p_unit_name TEXT,
  p_year INTEGER,
  p_meeting_date TEXT,
  p_status TEXT,
  p_htxsnv_mode TEXT,
  p_max_htxsnv_percent INTEGER,
  p_candidates JSONB,
  p_eligible_voters JSONB,
  p_created_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash TEXT;
BEGIN
  IF p_unit_key NOT IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt') THEN
    RAISE EXCEPTION 'Đơn vị không hợp lệ.';
  END IF;
  SELECT password_hash INTO v_stored_hash FROM public.branch_access WHERE unit_key = p_unit_key;
  IF v_stored_hash IS NULL OR v_stored_hash <> p_branch_proof THEN
    RAISE EXCEPTION 'Phiên đăng nhập đầu mối đơn vị không hợp lệ.';
  END IF;

  INSERT INTO public.voting_sessions (
    id, title, template, category, unit_key, unit_name, year,
    meeting_date, status, htxsnv_mode, max_htxsnv_percent,
    candidates, eligible_voters, created_by, closed_at
  )
  VALUES (
    p_id, p_title, p_template, p_category, p_unit_key, p_unit_name, p_year,
    p_meeting_date, p_status, p_htxsnv_mode, p_max_htxsnv_percent,
    COALESCE(p_candidates, '[]'::jsonb), COALESCE(p_eligible_voters, '[]'::jsonb),
    p_created_by,
    CASE WHEN p_status = 'closed' THEN NOW() ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    meeting_date = EXCLUDED.meeting_date,
    status = EXCLUDED.status,
    htxsnv_mode = EXCLUDED.htxsnv_mode,
    max_htxsnv_percent = EXCLUDED.max_htxsnv_percent,
    candidates = EXCLUDED.candidates,
    eligible_voters = EXCLUDED.eligible_voters,
    closed_at = CASE
      WHEN EXCLUDED.status = 'closed' AND public.voting_sessions.closed_at IS NULL THEN NOW()
      WHEN EXCLUDED.status <> 'closed' THEN NULL
      ELSE public.voting_sessions.closed_at
    END
  WHERE public.voting_sessions.unit_key = p_unit_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_delete_voting_session(
  p_branch_proof TEXT,
  p_session_id TEXT,
  p_unit_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash TEXT;
BEGIN
  SELECT password_hash INTO v_stored_hash FROM public.branch_access WHERE unit_key = p_unit_key;
  IF v_stored_hash IS NULL OR v_stored_hash <> p_branch_proof THEN
    RAISE EXCEPTION 'Phiên đăng nhập đầu mối đơn vị không hợp lệ.';
  END IF;
  DELETE FROM public.voting_sessions WHERE id = p_session_id AND unit_key = p_unit_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_secret_ballot(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_voting_tally(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_upsert_voting_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, JSONB, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_delete_voting_session(TEXT, TEXT, TEXT) TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'voting_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voting_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'voting_voters'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voting_voters;
  END IF;
END $$;`;

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
  unit_key TEXT PRIMARY KEY CHECK (unit_key IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt')),
  unit_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  hint_label TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.branch_access DROP CONSTRAINT IF EXISTS branch_access_unit_key_check;
ALTER TABLE public.branch_access ADD CONSTRAINT branch_access_unit_key_check
  CHECK (unit_key IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt'));

INSERT INTO public.branch_access (unit_key, unit_name, password_hash, hint_label)
VALUES
  ('dang-bo', 'Đảng bộ trường', 'd79c069c11868acc975e24a1f27c25d98cb7cc5ed1638304625e393bdce092a1', 'Thư ký Đảng bộ trường – Mặc định (dangbo@2026)'),
  ('cb1', 'Chi bộ 1', '2db1826642c1e22f56129d2482dfa8ad634ab60f2f4a96e62113d79159563b96', 'Bí thư / Thư ký Chi bộ 1 – Mặc định (cb1@2026)'),
  ('cb2', 'Chi bộ 2', 'd5d74bd024319f58ebdfd16d53d0a4e0067f575bf3f2d60737ecd1a1eeb97747', 'Bí thư / Thư ký Chi bộ 2 – Mặc định (cb2@2026)'),
  ('cb3', 'Chi bộ 3', '6fbcc6256beb8a3d6fd0f6378d1cecd6b99e471ef482978b418eec881608282b', 'Bí thư / Thư ký Chi bộ 3 – Mặc định (cb3@2026)'),
  ('cb4', 'Chi bộ 4', 'dded06ea66faa98cafc88892eb8ea64acca8e9fc1621c2e709be5e10ff09d91d', 'Bí thư / Thư ký Chi bộ 4 – Mặc định (cb4@2026)'),
  ('ubkt', 'UBKT Đảng uỷ', '134a41affb3514d64e1f7c7690106c9b90c153d8fca72e1f65b4347848443ac9', 'Thư ký UBKT Đảng uỷ – Mặc định (ubkt@2026)')
ON CONFLICT (unit_key) DO NOTHING;

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
  IF p_unit_key NOT IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt') THEN
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

  IF v_row.unit_key NOT IN ('dang-bo', 'cb1', 'cb2', 'cb3', 'cb4', 'ubkt') THEN
    RAISE EXCEPTION 'Đơn vị không hợp lệ.';
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


