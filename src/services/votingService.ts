import { isSupabaseConfigured, supabase } from '../supabase';
import {
  CandidateTally,
  HtxsnvMode,
  ShortRating,
  UnitKey,
  UnitName,
  VoterAttendance,
  VotingCandidate,
  VotingCategory,
  VotingSession,
  VotingStatus,
  VotingTallyResult,
  VotingTemplate,
  VotingVoter,
} from '../types';

interface VotingSessionDbRow {
  id: string;
  title: string;
  template: VotingTemplate;
  category: VotingCategory;
  unit_key: UnitKey;
  unit_name: UnitName;
  year: number;
  meeting_date: string;
  status: VotingStatus;
  htxsnv_mode: HtxsnvMode;
  max_htxsnv_percent: number;
  candidates: VotingCandidate[];
  eligible_voters: VotingVoter[];
  created_by: string;
  created_at: string;
  closed_at: string | null;
}

interface VotingVoterDbRow {
  session_id: string;
  voter_id: string;
  voter_name: string;
  voted_at: string;
}

function rowToVotingSession(row: VotingSessionDbRow): VotingSession {
  return {
    id: row.id,
    title: row.title,
    template: row.template,
    category: row.category,
    unitKey: row.unit_key,
    unitName: row.unit_name,
    year: row.year,
    meetingDate: row.meeting_date ?? '',
    status: row.status,
    htxsnvMode: row.htxsnv_mode ?? 'warn',
    maxHtxsnvPercent: row.max_htxsnv_percent ?? 20,
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
    eligibleVoters: Array.isArray(row.eligible_voters)
      ? row.eligible_voters
      : [],
    createdBy: row.created_by ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    closedAt: row.closed_at,
  };
}

export function isMissingVotingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('voting_sessions') ||
    msg.includes('voting_voters') ||
    msg.includes('cast_secret_ballot') ||
    msg.includes('get_voting_tally')
  );
}

export async function fetchAllVotingSessions(): Promise<VotingSession[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Chưa cấu hình kết nối Supabase.');
  }
  const { data, error } = await supabase
    .from('voting_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as VotingSessionDbRow[]).map(rowToVotingSession);
}

export async function fetchAllVoterAttendance(): Promise<VoterAttendance[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('voting_voters')
    .select('session_id, voter_id, voter_name, voted_at')
    .order('voted_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as VotingVoterDbRow[]).map((r) => ({
    sessionId: r.session_id,
    voterId: r.voter_id,
    voterName: r.voter_name,
    votedAt: r.voted_at,
  }));
}

export function subscribeVotingRealtime(
  onUpdate: (sessions: VotingSession[], attendance: VoterAttendance[]) => void,
  onError: (err: unknown) => void
): () => void {
  let active = true;

  const refresh = async () => {
    try {
      const [sessions, attendance] = await Promise.all([
        fetchAllVotingSessions(),
        fetchAllVoterAttendance(),
      ]);
      if (active) {
        onUpdate(sessions, attendance);
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
    .channel('voting-realtime-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'voting_sessions' },
      () => {
        void refresh();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'voting_voters' },
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

export async function saveVotingSessionAsAdmin(
  session: VotingSession
): Promise<void> {
  const { error } = await supabase.from('voting_sessions').upsert(
    {
      id: session.id,
      title: session.title,
      template: session.template,
      category: session.category,
      unit_key: session.unitKey,
      unit_name: session.unitName,
      year: session.year,
      meeting_date: session.meetingDate,
      status: session.status,
      htxsnv_mode: session.htxsnvMode,
      max_htxsnv_percent: session.maxHtxsnvPercent,
      candidates: session.candidates,
      eligible_voters: session.eligibleVoters,
      created_by: session.createdBy,
      closed_at:
        session.status === 'closed'
          ? session.closedAt || new Date().toISOString()
          : null,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

export async function saveVotingSessionAsBranch(
  session: VotingSession,
  branchProof: string
): Promise<void> {
  const { error } = await supabase.rpc('branch_upsert_voting_session', {
    p_branch_proof: branchProof,
    p_id: session.id,
    p_title: session.title,
    p_template: session.template,
    p_category: session.category,
    p_unit_key: session.unitKey,
    p_unit_name: session.unitName,
    p_year: session.year,
    p_meeting_date: session.meetingDate,
    p_status: session.status,
    p_htxsnv_mode: session.htxsnvMode,
    p_max_htxsnv_percent: session.maxHtxsnvPercent,
    p_candidates: session.candidates,
    p_eligible_voters: session.eligibleVoters,
    p_created_by: session.createdBy,
  });
  if (error) throw error;
}

export async function deleteVotingSessionAsAdmin(
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from('voting_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}

export async function deleteVotingSessionAsBranch(
  sessionId: string,
  unitKey: UnitKey,
  branchProof: string
): Promise<void> {
  const { error } = await supabase.rpc('branch_delete_voting_session', {
    p_branch_proof: branchProof,
    p_session_id: sessionId,
    p_unit_key: unitKey,
  });
  if (error) throw error;
}

export async function castSecretBallot(params: {
  sessionId: string;
  voterId: string;
  voterName: string;
  choices: Record<string, ShortRating>;
}): Promise<void> {
  const { error } = await supabase.rpc('cast_secret_ballot', {
    p_session_id: params.sessionId,
    p_voter_id: params.voterId,
    p_voter_name: params.voterName,
    p_choices: params.choices,
  });
  if (error) throw error;
}

export async function fetchVotingTally(
  sessionId: string
): Promise<VotingTallyResult> {
  const { data, error } = await supabase.rpc('get_voting_tally', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as {
    status?: VotingStatus;
    total_ballots?: number;
    tallies?: Record<string, CandidateTally>;
  };
  return {
    status: raw.status ?? 'draft',
    totalBallots: Number(raw.total_ballots ?? 0),
    tallies: raw.tallies ?? {},
  };
}
