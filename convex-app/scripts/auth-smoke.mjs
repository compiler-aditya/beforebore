// Integration check with an ephemeral software WebAuthn authenticator.
// Restricted to this project's known deployments; creates one synthetic test account.
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

function cborPrefix(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  const bytes = Buffer.alloc(3);
  bytes[0] = (major << 5) | 25;
  bytes.writeUInt16BE(length, 1);
  return bytes;
}

function cbor(value) {
  if (typeof value === "number") return cborPrefix(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  if (typeof value === "string") {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborPrefix(3, bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value)) return Buffer.concat([cborPrefix(2, value.length), value]);
  if (value instanceof Map) {
    return Buffer.concat([cborPrefix(5, value.size), ...[...value].flatMap(([key, entry]) => [cbor(key), cbor(entry)])]);
  }
  throw new Error("Unsupported CBOR test value.");
}

const deployment = process.env.NEXT_PUBLIC_CONVEX_URL;
const allowedOrigins = new Map([
  ["https://next-ocelot-989.convex.cloud", "http://localhost:62731"],
  ["https://tacit-anaconda-976.convex.cloud", "https://tacit-anaconda-976.convex.site"],
]);
const origin = allowedOrigins.get(deployment);
if (!origin) throw new Error("This smoke test is restricted to known BeforeBore deployments.");

const client = new ConvexHttpClient(deployment);
const username = `smoke-${Date.now()}`;
const rpId = new URL(origin).hostname;
const credentialId = randomBytes(32);
const encodedId = credentialId.toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = publicKey.export({ format: "jwk" });
const encoded = (value) => Buffer.from(value).toString("base64url");
const clientData = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
const rpHash = createHash("sha256").update(rpId).digest();
const counter = (value) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };

const registration = await client.mutation(api.auth.startSignIn, { username });
if (!registration.success || registration.step !== "register") throw new Error("Registration did not start.");
const coseKey = cbor(new Map([
  [1, 2], [3, -7], [-1, 1],
  [-2, Buffer.from(jwk.x, "base64url")],
  [-3, Buffer.from(jwk.y, "base64url")],
]));
const credentialLength = Buffer.alloc(2);
credentialLength.writeUInt16BE(credentialId.length);
const registerAuthData = Buffer.concat([
  rpHash, Buffer.from([0x45]), counter(0), Buffer.alloc(16),
  credentialLength, credentialId, Buffer.from(coseKey),
]);
const attestationObject = cbor(new Map([
  ["fmt", "none"], ["attStmt", new Map()], ["authData", registerAuthData],
]));
const signUp = await client.mutation(api.auth.finishSignUp, {
  username,
  response: {
    id: encodedId,
    rawId: encodedId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: encoded(clientData("webauthn.create", registration.options.challenge)),
      attestationObject: encoded(attestationObject),
    },
  },
});
if (signUp.status !== "complete") throw new Error(`Registration failed: ${signUp.userError.error}`);
client.setAuth(signUp.tokens.accessToken);
const current = await client.query(api.users.current, {});
if (current.username !== username) throw new Error("Authenticated user lookup failed.");
let dashboard = await client.query(api.dashboard.get, { projectCode: "ALDER-5" });
if (!dashboard && process.env.AUTH_SMOKE_SEED === "1") {
  await client.mutation(api.demo.seedDemo, {});
  dashboard = await client.query(api.dashboard.get, { projectCode: "ALDER-5" });
}
if (!dashboard?.project) throw new Error("Authenticated dashboard lookup failed.");

client.clearAuth();
const authentication = await client.mutation(api.auth.startSignIn, { username });
if (!authentication.success || authentication.step !== "authenticate") throw new Error("Sign-in did not start.");
const assertionData = clientData("webauthn.get", authentication.options.challenge);
const assertionAuthData = Buffer.concat([rpHash, Buffer.from([0x05]), counter(1)]);
const signed = sign("sha256", Buffer.concat([
  assertionAuthData, createHash("sha256").update(assertionData).digest(),
]), privateKey);
const signIn = await client.mutation(api.auth.finishSignIn, {
  response: {
    id: encodedId,
    rawId: encodedId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      authenticatorData: encoded(assertionAuthData),
      clientDataJSON: encoded(assertionData),
      signature: encoded(signed),
      userHandle: registration.options.user.id,
    },
  },
});
if (signIn.status !== "complete") throw new Error(`Sign-in failed: ${signIn.userError.error}`);
client.setAuth(signIn.tokens.accessToken);
if ((await client.query(api.users.current, {})).username !== username) {
  throw new Error("Authenticated sign-in round trip failed.");
}
const expectedInboxSubject = process.env.AUTH_SMOKE_EXPECT_INBOX_SUBJECT;
if (expectedInboxSubject) {
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  const refreshedDashboard = await client.query(api.dashboard.get, { projectCode: "ALDER-5" });
  const received = refreshedDashboard?.inboxMessages.some((message) =>
    message.subject.includes(expectedInboxSubject),
  );
  if (!received) {
    throw new Error("Expected AgentMail inbox message was not recorded before the verification window elapsed.");
  }
  console.log("AgentMail signed inbound delivery was recorded in the live inbox.");
}
console.log("Passkey registration, authorized queries, and repeat sign-in passed.");
