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

// cria cartela 4x4 (desafios aleatórios)
export async function generateBoard(groupId: string) {
  const { data: all, error } = await supabase.from('challenges').select('*');
  if (error || !all) throw error ?? new Error('Sem desafios');

  const commons = all.filter(c => c.is_common);
  const pool = all.filter(c => !c.is_common);

  // 16 casas (4x4): desafios comuns + aleatórios
  const needed = 16;
  const chosen = [...commons];
  while (chosen.length < needed && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }

  const shuffled = chosen.sort(() => Math.random() - 0.5).slice(0, 16);

  // associa desafios à mesa
  await supabase.from('assignments').insert(
    shuffled.map((ch, i) => ({
      group_id: groupId,
      challenge_id: ch.id,
      row: Math.floor(i / 4),
      col: i % 4
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
  // Vai buscar todos os assignments do grupo
  const { data: assignments, error: aErr } = await supabase
    .from('assignments')
    .select('id, row, col, challenge_id, group_id')
    .eq('group_id', groupId);

  if (aErr) {
    console.error('Erro a obter assignments:', aErr);
    return [];
  }

  if (!assignments?.length) {
    console.warn('Nenhum assignment encontrado para este grupo.');
    return [];
  }

  // Vai buscar os desafios correspondentes
  const challengeIds = assignments.map(a => a.challenge_id);
  const { data: challenges, error: cErr } = await supabase
    .from('challenges')
    .select('id, text')
    .in('id', challengeIds);

  if (cErr) {
    console.error('Erro a obter challenges:', cErr);
    return [];
  }

  // Vai buscar o progresso (para saber se estão completas e o ficheiro)
  const { data: progress, error: pErr } = await supabase
    .from('progress')
    .select('id, challenge_id, completed, file_path')
    .eq('group_id', groupId);

  if (pErr) {
    console.error('Erro a obter progress:', pErr);
    return [];
  }

  // Combina tudo
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
