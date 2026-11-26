-- ============================================================================
-- PHÂN HỆ BỎ PHIẾU TRỰC TUYẾN (MẪU 4 & MẪU 5) — BỎ PHIẾU KÍN (KHÔNG KÝ TÊN)
-- ĐẢNG BỘ TRƯỜNG THPT THANH HOÀ
-- Hướng dẫn: Mở Supabase -> SQL Editor -> New query -> Dán toàn bộ -> bấm Run
-- ============================================================================

-- 1. Bảng phiên bỏ phiếu
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

-- 2. Bảng điểm danh người đã bỏ phiếu (CHỈ ghi nhận đã bỏ phiếu để chống bỏ trùng, KHÔNG lưu nội dung lá phiếu)
CREATE TABLE IF NOT EXISTS public.voting_voters (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.voting_sessions(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  voter_name TEXT NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_voting_voters_session ON public.voting_voters (session_id);

-- 3. Bảng hòm phiếu kín (HOÀN TOÀN ẨN DANH — không có cột voter_id, không có họ tên, làm tròn giờ để không thể đối chiếu)
CREATE TABLE IF NOT EXISTS public.voting_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES public.voting_sessions(id) ON DELETE CASCADE,
  choices JSONB NOT NULL,
  submitted_bucket TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', NOW())
);

CREATE INDEX IF NOT EXISTS idx_voting_ballots_session ON public.voting_ballots (session_id);

-- 4. Bật Row Level Security (RLS)
ALTER TABLE public.voting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_ballots ENABLE ROW LEVEL SECURITY;

-- voting_sessions: Mọi người đọc được phiên bỏ phiếu; Admin (authenticated) quản lý trực tiếp
DROP POLICY IF EXISTS "voting_sessions_select_all" ON public.voting_sessions;
CREATE POLICY "voting_sessions_select_all"
  ON public.voting_sessions FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "voting_sessions_admin_all" ON public.voting_sessions;
CREATE POLICY "voting_sessions_admin_all"
  ON public.voting_sessions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- voting_voters: Mọi người đọc được danh sách đã điểm danh bỏ phiếu; chỉ ghi qua hàm cast_secret_ballot hoặc Admin xoá
DROP POLICY IF EXISTS "voting_voters_select_all" ON public.voting_voters;
CREATE POLICY "voting_voters_select_all"
  ON public.voting_voters FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "voting_voters_admin_delete" ON public.voting_voters;
CREATE POLICY "voting_voters_admin_delete"
  ON public.voting_voters FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- voting_ballots: ĐÓNG KÍN HOÀN TOÀN với SELECT/INSERT trực tiếp từ trình duyệt; chỉ ghi qua cast_secret_ballot và tổng hợp qua get_voting_tally
DROP POLICY IF EXISTS "voting_ballots_admin_delete" ON public.voting_ballots;
CREATE POLICY "voting_ballots_admin_delete"
  ON public.voting_ballots FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 5. Hàm RPC bỏ phiếu kín nguyên tử (chống bỏ 2 lần + tách biệt hoàn toàn danh tính và lá phiếu)
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
  SELECT * INTO v_session
  FROM public.voting_sessions
  WHERE id = p_session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên bỏ phiếu.';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Phiên bỏ phiếu này hiện chưa mở hoặc đã chốt hòm phiếu.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_session.eligible_voters) AS elem
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

  -- Ghi nhận điểm danh đã bỏ phiếu (ràng buộc UNIQUE chống bỏ phiếu 2 lần)
  BEGIN
    INSERT INTO public.voting_voters (session_id, voter_id, voter_name)
    VALUES (p_session_id, p_voter_id, COALESCE(NULLIF(TRIM(p_voter_name), ''), p_voter_id));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Đồng chí này đã bỏ phiếu trong phiên này rồi (mỗi đồng chí chỉ được bỏ 1 phiếu kín).';
  END;

  -- Lưu lá phiếu ẩn danh hoàn toàn vào hòm phiếu kín
  INSERT INTO public.voting_ballots (session_id, choices)
  VALUES (p_session_id, p_choices);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. Hàm RPC kiểm phiếu (chỉ công bố chi tiết khi phiên đã CHỐT; khi đang mở chỉ trả tổng số phiếu đã thu)
CREATE OR REPLACE FUNCTION public.get_voting_tally(
  p_session_id TEXT
)
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
  SELECT * INTO v_session
  FROM public.voting_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'draft', 'total_ballots', 0, 'tallies', '{}'::jsonb);
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_total_ballots
  FROM public.voting_ballots
  WHERE session_id = p_session_id;

  IF v_session.status <> 'closed' THEN
    RETURN jsonb_build_object(
      'status', v_session.status,
      'total_ballots', v_total_ballots,
      'tallies', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      cand_id,
      jsonb_build_object(
        'HTXSNV', htxsnv_cnt,
        'HTTNV', httnv_cnt,
        'HTNV', htnv_cnt,
        'KHTNV', khtnv_cnt
      )
    ),
    '{}'::jsonb
  )
  INTO v_tallies
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

  RETURN jsonb_build_object(
    'status', 'closed',
    'total_ballots', v_total_ballots,
    'tallies', v_tallies
  );
END;
$$;

-- 7. Hàm RPC cho Đầu mối Chi bộ / Thư ký đơn vị quản lý phiên bỏ phiếu thuộc đơn vị mình
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

  SELECT password_hash INTO v_stored_hash
  FROM public.branch_access
  WHERE unit_key = p_unit_key;

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
  SELECT password_hash INTO v_stored_hash
  FROM public.branch_access
  WHERE unit_key = p_unit_key;

  IF v_stored_hash IS NULL OR v_stored_hash <> p_branch_proof THEN
    RAISE EXCEPTION 'Phiên đăng nhập đầu mối đơn vị không hợp lệ.';
  END IF;

  DELETE FROM public.voting_sessions
  WHERE id = p_session_id AND unit_key = p_unit_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_secret_ballot(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_voting_tally(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_upsert_voting_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, JSONB, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_delete_voting_session(TEXT, TEXT, TEXT) TO anon, authenticated;

-- 8. Bật đồng bộ thời gian thực (Realtime) cho phiên bỏ phiếu & bảng điểm danh
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
END $$;
