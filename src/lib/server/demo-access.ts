export const DEMO_ACCESS_KEY_HEADER = "x-keiriflow-demo-key";

const textEncoder = new TextEncoder();

type DemoAccessFailure = {
  error: "demo_key_not_configured" | "demo_key_required" | "invalid_demo_key";
};

export async function verifyDemoAccessRequest(request: Request): Promise<Response | null> {
  const expectedKey = process.env.KEIRIFLOW_DEMO_ACCESS_KEY?.trim();

  if (!expectedKey) {
    if (isExternalDemoMode()) {
      return createDemoAccessError("demo_key_not_configured", 503);
    }

    return null;
  }

  const suppliedKey = request.headers.get(DEMO_ACCESS_KEY_HEADER)?.trim();

  if (!suppliedKey) {
    return createDemoAccessError("demo_key_required");
  }

  if (!(await timingSafeEqual(suppliedKey, expectedKey))) {
    return createDemoAccessError("invalid_demo_key");
  }

  return null;
}

export async function hashDemoGuardValue(value: string): Promise<string> {
  return [...(await sha256(value))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function timingSafeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let mismatch = 0;

  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash[index] ^ rightHash[index];
  }

  return mismatch === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return new Uint8Array(digest);
}

function isExternalDemoMode() {
  return (
    process.env.AI_PROVIDER_MODE === "anthropic" ||
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) ||
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  );
}

function createDemoAccessError(error: DemoAccessFailure["error"], status = 401) {
  return Response.json({ error } satisfies DemoAccessFailure, { status });
}
