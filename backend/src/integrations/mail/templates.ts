/** 邮件正文。纯内联样式——邮件客户端不认外部样式表，也基本不认 <style>。 */

type Bilingual = { zh: string; en: string };

const DEFAULT_FOOTER: Bilingual = {
  zh: "若你并未发起此操作，忽略本邮件即可，无需处理。",
  en: "If you did not request this, you can safely ignore this email.",
};

function section(title: string, body: string, footer: string) {
  return `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600">${title}</h2>
  ${body}
  <p style="margin:24px 0 0;color:#8e8e93;font-size:13px">${footer}</p>`;
}

function shell(title: Bilingual, body: Bilingual, footer: Bilingual = DEFAULT_FOOTER) {
  return `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1c1c1e;max-width:520px">
  ${section(title.zh, body.zh, footer.zh)}
  <hr style="margin:28px 0;border:0;border-top:1px solid #e5e5e7">
  ${section(title.en, body.en, footer.en)}
</div>`;
}

function button(href: string, label: string, hint: string) {
  return `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;padding:10px 20px;background:#1c1c1e;color:#fff;text-decoration:none;border-radius:6px;font-weight:500">${label}</a></p>
<p style="margin:0;color:#8e8e93;font-size:13px">${hint}<br><span style="word-break:break-all">${href}</span></p>`;
}

const BUTTON_HINT: Bilingual = {
  zh: "若按钮无法点击，请复制以下地址至浏览器打开：",
  en: "If the button does not work, copy this address into your browser:",
};

const expiry = (minutes: number): Bilingual => ({
  zh: `<p style="margin:16px 0 0;color:#8e8e93;font-size:13px">链接 ${minutes} 分钟内有效，只能使用一次。</p>`,
  en: `<p style="margin:16px 0 0;color:#8e8e93;font-size:13px">The link is valid for ${minutes} minutes and can be used once.</p>`,
});

/** 邮件标题也双语，收件箱里两种读者都认得出这封信是干什么的。 */
export const mailSubjects = {
  verify: "CN 金榜 验证你的邮箱 / Verify your CN Gist email",
  reset: "CN 金榜 重置密码 / Reset your CN Gist password",
  passwordChanged: "CN 金榜 密码变更通知 / Your CN Gist password was changed",
};

export function verifyEmailTemplate(link: string, minutes: number) {
  const ttl = expiry(minutes);
  return shell(
    { zh: "验证你的邮箱", en: "Verify your email" },
    {
      zh: `<p style="margin:0">点击下面的按钮完成邮箱验证。验证后才能用邮箱找回密码。</p>
     ${button(link, "验证邮箱", BUTTON_HINT.zh)}
     ${ttl.zh}`,
      en: `<p style="margin:0">Use the button below to verify your email address. Verification is what makes password recovery by email possible.</p>
     ${button(link, "Verify email", BUTTON_HINT.en)}
     ${ttl.en}`,
    },
  );
}

export function resetPasswordTemplate(link: string, minutes: number) {
  const ttl = expiry(minutes);
  return shell(
    { zh: "重置密码", en: "Reset your password" },
    {
      zh: `<p style="margin:0">我们收到了重置 CN 金榜账户密码的请求。点击下面的按钮设置新密码。</p>
     ${button(link, "设置新密码", BUTTON_HINT.zh)}
     ${ttl.zh}`,
      en: `<p style="margin:0">We received a request to reset the password of your CN Gist account. Use the button below to set a new one.</p>
     ${button(link, "Set a new password", BUTTON_HINT.en)}
     ${ttl.en}`,
    },
    {
      zh: "若你并未申请重置密码，忽略本邮件即可，你的密码不会有任何变化。",
      en: "If you did not ask for a password reset, ignore this email — your password stays as it is.",
    },
  );
}

export function passwordChangedTemplate(at: string) {
  return shell(
    { zh: "密码已变更", en: "Your password was changed" },
    {
      zh: `<p style="margin:0">你的 CN 金榜账户密码已于 <strong>${at}</strong> 变更。</p>`,
      en: `<p style="margin:0">The password of your CN Gist account was changed at <strong>${at}</strong> (Beijing time).</p>`,
    },
    {
      zh: "若这不是你本人的操作，请立即通过「忘记密码」重置密码。",
      en: "If this was not you, reset your password immediately using “Forgot your password?”.",
    },
  );
}
