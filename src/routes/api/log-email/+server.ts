import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: RequestHandler = async ({ request }) => {
  let email: unknown;

  try {
    ({ email } = await request.json());
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
    return new Response("Invalid email", { status: 400 });
  }

  if (!env.SLACK_WEBHOOK_URL) {
    return new Response(null, { status: 204 });
  }

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `New Haven signup: ${email}` }),
  });

  if (!response.ok) {
    console.error(`Slack webhook returned ${response.status}`);
  }

  return new Response(null, { status: 204 });
};
