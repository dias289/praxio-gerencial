/**
 * Leitor do código de verificação em duas etapas (2FA) do vpabx via IMAP.
 *
 * Conecta na caixa de e-mail, procura a mensagem mais recente do vpabx / IP Force
 * e extrai o código numérico. Faz polling até o e-mail chegar (o código costuma
 * demorar alguns segundos após o login).
 *
 * Config do servidor vem por variáveis de ambiente (a SENHA nunca fica no código):
 *   IMAP_HOST, IMAP_PORT, IMAP_SECURE ("true" p/ SSL direto), IMAP_USER, IMAP_PASS
 */
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface Imap2FAOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  desdeMs?: number;
  timeoutMs?: number;
  remetenteRegex?: RegExp;
}

/** Extrai um código de 4 a 8 dígitos de um texto. */
function extrairCodigo(texto: string): string | null {
  if (!texto) return null;
  const rotulado = texto.match(/(?:c[oó]digo|code|token|otp|verifica[çc][aã]o)[^\d]{0,20}(\d{4,8})/i);
  if (rotulado) return rotulado[1];
  const m = texto.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

export async function lerCodigo2FA(opts: Imap2FAOptions): Promise<string | null> {
  const filtro = opts.remetenteRegex ?? /vpabx|ip\s*force|verifica|c[oó]digo|autentica|two|2fa/i;
  const desde = new Date(opts.desdeMs ?? Date.now() - 10 * 60_000);
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);

  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
  });

  await client.connect();
  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = (await client.search({ since: desde }, { uid: true })) || [];
        const recentes = uids.slice(-12).reverse();
        for (const uid of recentes) {
          const msg = (await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true })) as FetchMessageObject | false;
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const envFrom = (msg.envelope?.from ?? []) as Array<{ address?: string }>;
          const from = (parsed.from?.text ?? '') + ' ' + envFrom.map(f => f.address ?? '').join(' ');
          const assunto = parsed.subject ?? '';
          const corpo = parsed.text ?? '';
          const alvo = `${from} ${assunto} ${corpo}`;
          if (filtro.test(alvo)) {
            const codigo = extrairCodigo(assunto) ?? extrairCodigo(corpo);
            if (codigo) return codigo;
          }
        }
      } finally {
        lock.release();
      }
      await new Promise(r => setTimeout(r, 4000));
    }
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}
