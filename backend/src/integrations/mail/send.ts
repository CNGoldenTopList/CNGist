import { getConfig } from "../../config";
/** 发信。SMTP 配置缺失时整体禁用，调用方据此隐藏相关入口， */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

const globalForMail = globalThis as unknown as { __cngistMailer?: Transporter };

export function mailEnabled() {
  return Boolean(getConfig().mail?.host && getConfig().mail?.user && getConfig().mail?.password);
}

function transport() {
  if (globalForMail.__cngistMailer) return globalForMail.__cngistMailer;
  const port = Number(getConfig().mail?.port || 465);
  const created = nodemailer.createTransport({
    host: getConfig().mail?.host,
    port,
    // 465 是隐式 TLS；587 走 STARTTLS
    secure: port === 465,
    auth: { user: getConfig().mail?.user, pass: getConfig().mail?.password },
  });
  globalForMail.__cngistMailer = created;
  return created;
}

/** 发信失败不应该让调用它的业务失败，所以这里只返回成败，不抛。 */
export async function sendMail(input: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!mailEnabled()) {
    console.warn(`[mail] 未配置 SMTP，丢弃发往 ${input.to} 的邮件：${input.subject}`);
    return false;
  }
  try {
    await transport().sendMail({
      from: { name: getConfig().mail?.fromName || "CN 金榜", address: getConfig().mail?.user! },
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return true;
  } catch (error) {
    console.error(`[mail] 发送失败 to=${input.to} subject=${input.subject}`, error);
    return false;
  }
}
