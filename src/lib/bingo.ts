import { supabase } from '../supabaseClient';

// cria grupo novo (ou obtém se já existir)
export async function ensureGroup(name: string) {
  const token = crypto.randomUUID();

  // tenta ver se o grupo já existe
  const { data: existing } = await supabase
    .from('groups')
    .select('*')
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    localStorage.setItem('group_token', existing.local_token);
    localStorage.setItem('group_id', existing.id);
    localStorage.setItem('group_name', existing.name);
    return existing;
  }

  // se não existir, cria novo
  const { data: created, error } = await supabase
    .from('groups')
    .insert({ name, local_token: token })
    .select('*')
    .single();

  if (error) throw error;

  localStorage.setItem('group_token', token);
  localStorage.setItem('group_id', created.id);
  localStorage.setItem('group_name', created.name);

  await generateBoard(created.id);
  return created;
}

// cria cartela 3x3 (desafios aleatórios)
export async function generateBoard(groupId: string) {
  const { data: all, error } = await supabase.from('challenges').select('*');
  if (error || !all) throw error ?? new Error('Sem desafios');

  const commons = all.filter(c => c.is_common);
  const pool = all.filter(c => !c.is_common);

  // 9 casas (3x3): desafios comuns + aleatórios
  const needed = 9;
  const chosen = [...commons];

  while (chosen.length < needed && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }

  const shuffled = chosen.sort(() => Math.random() - 0.5).slice(0, 9);

  // associa desafios à mesa (3×3)
  await supabase.from('assignments').insert(
    shuffled.map((ch, i) => ({
      group_id: groupId,
      challenge_id: ch.id,
      row: Math.floor(i / 3),
      col: i % 3
    }))
  );

  // cria o progresso inicial (todas por fazer)
  await supabase.from('progress').insert(
    shuffled.map(ch => ({
      group_id: groupId,
      challenge_id: ch.id,
      completed: false
    }))
  );
}

// obtém o estado da cartela para o grupo
export async function getBoard(groupId: string) {
  const { data: assignments, error: aErr } = await supabase
    .from('assignments')
    .select('id, row, col, challenge_id, group_id')
    .eq('group_id', groupId);

  if (aErr || !assignments) return [];

  const challengeIds = assignments.map(a => a.challenge_id);
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id, text')
    .in('id', challengeIds);

  const { data: progress } = await supabase
    .from('progress')
    .select('id, challenge_id, completed, file_path')
    .eq('group_id', groupId);

  return assignments.map(a => {
    const challenge = challenges?.find(c => c.id === a.challenge_id);
    const prog = progress?.find(p => p.challenge_id === a.challenge_id);

    return {
      id: prog?.id ?? a.id,
      challenge_id: a.challenge_id,
      text: challenge?.text ?? 'Sem texto',
      completed: !!prog?.completed,
      row: a.row,
      col: a.col,
      file_path: prog?.file_path ?? null,
    };
  });
}
