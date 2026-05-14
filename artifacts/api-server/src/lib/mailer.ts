import nodemailer from "nodemailer";
import { logger } from "./logger";

function createTransporter() {
  const host = process.env["SMTP_HOST"];
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM_ADDRESS = process.env["SMTP_FROM"] ?? "noreply@bet62.com";
const FROM = `BET62 <${FROM_ADDRESS}>`;

function formatAmount(amount: string): string {
  return parseFloat(amount).toFixed(2).replace(".", ",");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BET62</title>
  <style>
    body { margin: 0; padding: 0; background-color: #18181b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background-color: #27272a; border-radius: 12px; overflow: hidden; border: 1px solid #3f3f46; }
    .header { background-color: #dc2626; padding: 28px 32px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: 2px; }
    .header p { margin: 4px 0 0; color: #fca5a5; font-size: 13px; }
    .body { padding: 32px; color: #e4e4e7; }
    .body p { margin: 0 0 16px; line-height: 1.6; font-size: 15px; }
    .amount-box { background-color: #18181b; border: 1px solid #3f3f46; border-radius: 8px; padding: 20px 24px; margin: 24px 0; text-align: center; }
    .amount-box .label { font-size: 12px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .amount-box .value { font-size: 32px; font-weight: 700; color: #ffffff; }
    .status-approved { color: #4ade80; font-weight: 600; }
    .status-rejected { color: #f87171; font-weight: 600; }
    .note-box { background-color: #3f3f46; border-left: 3px solid #f87171; border-radius: 4px; padding: 14px 16px; margin: 20px 0; font-size: 14px; color: #d4d4d8; }
    .footer { padding: 20px 32px; border-top: 1px solid #3f3f46; text-align: center; font-size: 12px; color: #71717a; }
    .footer a { color: #a1a1aa; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>BET62</h1>
      <p>Plataforma de Apostas Esportivas</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>© 2026 BET62. Todos os direitos reservados.</p>
      <p>Este e-mail foi enviado automaticamente. Por favor não responda.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendDepositConfirmed(
  email: string,
  name: string,
  amount: string,
  method: string,
): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    logger.warn("SMTP not configured — skipping deposit confirmed email");
    return;
  }

  const methodLabel: Record<string, string> = {
    multibanco: "Multibanco",
    mbway: "MB WAY",
    card: "Cartão de Crédito/Débito",
  };
  const methodDisplay = methodLabel[method] ?? method;

  const html = baseTemplate(`
    <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
    <p>O seu depósito foi <span class="status-approved">confirmado</span> e o saldo foi creditado na sua conta BET62.</p>
    <div class="amount-box">
      <div class="label">Valor depositado</div>
      <div class="value">€${formatAmount(amount)}</div>
    </div>
    <p><strong>Método de pagamento:</strong> ${escapeHtml(methodDisplay)}</p>
    <p>O saldo já está disponível para utilizar nas suas apostas. Boas apostas!</p>
  `);

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: `✅ Depósito de €${formatAmount(amount)} confirmado — BET62`,
      html,
    });
    logger.info({ email, amount, method }, "Deposit confirmed email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send deposit confirmed email");
  }
}

export async function sendWithdrawalApproved(
  email: string,
  name: string,
  amount: string,
): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    logger.warn("SMTP not configured — skipping withdrawal approved email");
    return;
  }

  const html = baseTemplate(`
    <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
    <p>Temos uma boa notícia! O seu pedido de levantamento foi <span class="status-approved">aprovado</span> e o pagamento foi processado.</p>
    <div class="amount-box">
      <div class="label">Valor levantado</div>
      <div class="value">€${formatAmount(amount)}</div>
    </div>
    <p>O montante será transferido para o IBAN que indicou. O prazo habitual de processamento bancário é de 1 a 3 dias úteis.</p>
    <p>Obrigado por confiar na BET62. Boas apostas!</p>
  `);

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: `✅ Levantamento de €${formatAmount(amount)} aprovado — BET62`,
      html,
    });
    logger.info({ email, amount }, "Withdrawal approved email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send withdrawal approved email");
  }
}

export async function sendWithdrawalRejected(
  email: string,
  name: string,
  amount: string,
  notes?: string | null,
): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    logger.warn("SMTP not configured — skipping withdrawal rejected email");
    return;
  }

  const noteSection = notes
    ? `<div class="note-box"><strong>Motivo indicado pelo administrador:</strong><br>${escapeHtml(notes)}</div>`
    : "";

  const html = baseTemplate(`
    <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
    <p>Lamentamos informar que o seu pedido de levantamento foi <span class="status-rejected">rejeitado</span>.</p>
    <div class="amount-box">
      <div class="label">Valor do pedido</div>
      <div class="value">€${formatAmount(amount)}</div>
    </div>
    ${noteSection}
    <p>O valor de <strong>€${formatAmount(amount)}</strong> foi devolvido ao seu saldo na BET62 e está disponível para utilizar imediatamente.</p>
    <p>Se tiver dúvidas, por favor contacte o nosso suporte.</p>
  `);

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: `❌ Pedido de levantamento de €${formatAmount(amount)} rejeitado — BET62`,
      html,
    });
    logger.info({ email, amount }, "Withdrawal rejected email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send withdrawal rejected email");
  }
}
