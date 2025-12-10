import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { to, subject, text, html } = body ?? {};
  if (!to || !subject || (!text && !html)) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (err: unknown) {
    console.error("Send error:", err);
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}