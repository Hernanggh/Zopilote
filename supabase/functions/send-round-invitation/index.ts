import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { roundId } = await req.json();
    if (!roundId) return new Response(JSON.stringify({ error: 'roundId requerido' }), { status: 400 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch round + course
    const { data: round, error: roundErr } = await supabase
      .from('rounds')
      .select('id, date, start_hole, created_by, courses(name)')
      .eq('id', roundId)
      .single();
    if (roundErr || !round) throw new Error('Partida no encontrada');

    const courseName = (round.courses as any)?.name ?? 'Campo';
    const dateStr = new Date(round.date + 'T12:00:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    // Fetch players in round with their emails
    const { data: roundPlayers, error: rpErr } = await supabase
      .from('round_players')
      .select('handicap, players(name, email, user_id)')
      .eq('round_id', roundId);
    if (rpErr) throw rpErr;

    // Get organizer name
    const organizerPlayer = roundPlayers?.find(
      (rp: any) => rp.players?.user_id === round.created_by
    );
    const organizerName = (organizerPlayer as any)?.players?.name ?? 'Tu organizador';

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY no configurada');

    // Send email to each player with an email
    const sends = (roundPlayers ?? [])
      .filter((rp: any) => rp.players?.email)
      .map(async (rp: any) => {
        const player = rp.players;
        const hoyo = round.start_hole === 10 ? 'Hoyo 10' : 'Hoyo 1';

        const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#1B3A28;border-radius:8px;overflow:hidden;border:1px solid #C9A84C;">
        <!-- Header -->
        <tr>
          <td style="background:#1B3A28;padding:28px 32px;text-align:center;border-bottom:2px solid #C9A84C;">
            <p style="margin:0;color:#C9A84C;font-size:22px;letter-spacing:4px;font-family:Georgia,serif;">ZOPILOTE</p>
            <p style="margin:4px 0 0;color:#C9A84C99;font-size:11px;font-family:Georgia,serif;font-style:italic;">— established 2026 —</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#F5F0E8;padding:32px;">
            <p style="margin:0 0 8px;font-size:14px;color:#555;font-family:Georgia,serif;">Hola, <strong>${player.name}</strong></p>
            <p style="margin:0 0 24px;font-size:18px;color:#1B3A28;font-family:Georgia,serif;line-height:1.5;">
              <strong>${organizerName}</strong> te invitó a una partida de golf.
            </p>
            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;border:1px solid #ddd;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #eee;">
                  <span style="font-size:10px;letter-spacing:1.5px;color:#999;font-family:monospace;">FECHA</span><br>
                  <span style="font-size:16px;color:#1B3A28;font-family:Georgia,serif;text-transform:capitalize;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #eee;">
                  <span style="font-size:10px;letter-spacing:1.5px;color:#999;font-family:monospace;">CAMPO</span><br>
                  <span style="font-size:16px;color:#1B3A28;font-family:Georgia,serif;">${courseName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #eee;">
                  <span style="font-size:10px;letter-spacing:1.5px;color:#999;font-family:monospace;">SALIDA</span><br>
                  <span style="font-size:16px;color:#1B3A28;font-family:Georgia,serif;">${hoyo}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;">
                  <span style="font-size:10px;letter-spacing:1.5px;color:#999;font-family:monospace;">TU HANDICAP</span><br>
                  <span style="font-size:16px;color:#C9A84C;font-family:monospace;font-weight:700;">${rp.handicap}</span>
                </td>
              </tr>
            </table>
            <!-- CTA button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td align="center">
                  <a href="${Deno.env.get('APP_URL') ?? 'https://zopilote.vercel.app'}/${round.id}"
                     style="display:inline-block;background:#1B3A28;color:#C9A84C;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:2px;text-decoration:none;padding:14px 32px;border-radius:4px;border:1px solid #C9A84C;">
                    VER PARTIDA EN VIVO
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#999;font-family:Georgia,serif;font-style:italic;text-align:center;">
              Abre Zopilote para seguir la partida en vivo.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Zopilote <onboarding@resend.dev>',
            to: [player.email],
            subject: `${organizerName} te invitó a jugar hoy en Zopilote`,
            html,
          }),
        });
      });

    await Promise.allSettled(sends);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
