// Object storage and malware scanning for provider documents.
//
// Documents never go in the main database. They live in an S3-compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces)
// with server-side encryption. The server hands out short-lived signed URLs: one to upload a single file of a declared size
// and type, one to read it. Signing is SigV4 done here with `crypto`, so no cloud SDK is needed.
//
// Scanning goes through `Scanner`. The real one talks to a ClamAV daemon (clamd) over TCP. With no scanner configured a
// document stays "pending", and a case with a pending document cannot be approved: nothing unscanned is treated as clean.
import crypto from 'crypto';
import net from 'net';
// ----- file type from the first bytes -----
export function sniffProviderDoc(b) {
    if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-')
        return 'application/pdf';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return 'image/jpeg';
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'image/png';
    return null;
}
/** A name safe to show and to keep in metadata. The object key never uses it. */
export function safeDocName(raw) {
    const t = String(raw ?? '').replace(/[\\/\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
    return t || 'document';
}
// ----- SigV4 -----
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p) => p.split('/').map(enc).join('/');
function target(c, key) {
    const u = new URL(c.endpoint);
    if (c.pathStyle)
        return { host: u.host, path: `/${encPath(c.bucket)}/${encPath(key)}`, origin: u.origin };
    return { host: `${c.bucket}.${u.host}`, path: `/${encPath(key)}`, origin: `${u.protocol}//${c.bucket}.${u.host}` };
}
/**
 * Presigned URL (query-string SigV4). `headers` are signed too, so the uploader must send exactly those.
 * Exported for tests: it matches AWS's published example for a presigned GET.
 */
export function presign(c, method, key, expiresSec, headers = {}, now = new Date()) {
    const t = target(c, key);
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const scope = `${day}/${c.region}/s3/aws4_request`;
    const signed = { host: t.host };
    for (const [k, v] of Object.entries(headers))
        signed[k.toLowerCase()] = String(v).trim();
    const names = Object.keys(signed).sort();
    const query = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${c.accessKey}/${scope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresSec),
        'X-Amz-SignedHeaders': names.join(';'),
    };
    const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
    const canonical = [method, t.path, canonicalQuery, names.map((n) => `${n}:${signed[n]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
    const kDate = hmac(`AWS4${c.secretKey}`, day);
    const sig = crypto.createHmac('sha256', hmac(hmac(hmac(kDate, c.region), 's3'), 'aws4_request')).update(toSign).digest('hex');
    return `${t.origin}${t.path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
}
export function createS3Storage(c, fetchImpl = fetch) {
    if (!c) {
        const off = () => { throw new Error('Document storage is not configured'); };
        return { configured: false, signedPutUrl: off, signedGetUrl: off, head: async () => off(), getObject: async () => off(), deleteObject: async () => off() };
    }
    const putHeaders = (contentType, contentLength) => ({
        'content-type': contentType,
        'content-length': String(contentLength),
        ...(c.sse ? { 'x-amz-server-side-encryption': c.sse } : {}),
    });
    return {
        configured: true,
        signedPutUrl(key, o) {
            const headers = putHeaders(o.contentType, o.contentLength);
            // The uploader sends these headers unchanged. Host and content-length are set by the HTTP client.
            return { url: presign(c, 'PUT', key, o.expiresSec, headers), headers };
        },
        signedGetUrl: (key, expiresSec) => presign(c, 'GET', key, expiresSec),
        async head(key) {
            const r = await fetchImpl(presign(c, 'HEAD', key, 60), { method: 'HEAD' });
            if (r.status === 404)
                return null;
            if (!r.ok)
                throw new Error(`Storage HEAD ${r.status}`);
            return { size: Number(r.headers.get('content-length') ?? '0'), contentType: String(r.headers.get('content-type') ?? '') };
        },
        async getObject(key) {
            const r = await fetchImpl(presign(c, 'GET', key, 60));
            if (r.status === 404)
                return null;
            if (!r.ok)
                throw new Error(`Storage GET ${r.status}`);
            return Buffer.from(await r.arrayBuffer());
        },
        async deleteObject(key) {
            const r = await fetchImpl(presign(c, 'DELETE', key, 60), { method: 'DELETE' });
            if (!r.ok && r.status !== 404)
                throw new Error(`Storage DELETE ${r.status}`);
        },
    };
}
export function s3ConfigFromEnv(env = process.env) {
    const { DOC_STORAGE_ENDPOINT: endpoint, DOC_STORAGE_BUCKET: bucket, DOC_STORAGE_REGION: region, DOC_STORAGE_ACCESS_KEY: accessKey, DOC_STORAGE_SECRET_KEY: secretKey } = env;
    if (!endpoint || !bucket || !region || !accessKey || !secretKey)
        return null;
    return { endpoint, bucket, region, accessKey, secretKey, pathStyle: env.DOC_STORAGE_PATH_STYLE === 'true', sse: env.DOC_STORAGE_SSE || undefined };
}
// ----- ClamAV (clamd INSTREAM) -----
/** Reads clamd's reply to INSTREAM. Exported for tests. */
export function parseClamReply(reply) {
    const r = reply.replace(/\0/g, '').trim();
    if (/\bOK$/.test(r))
        return 'clean';
    if (/FOUND$/.test(r))
        return 'infected';
    return 'error';
}
export function createClamScanner(host, port = 3310, timeoutMs = 30_000) {
    if (!host)
        return { configured: false, scan: async () => 'error' };
    return {
        configured: true,
        scan: (bytes) => new Promise((resolve) => {
            const sock = net.createConnection({ host, port });
            let out = '';
            let done = false;
            const finish = (v) => { if (!done) {
                done = true;
                sock.destroy();
                resolve(v);
            } };
            sock.setTimeout(timeoutMs, () => finish('error'));
            sock.on('error', () => finish('error'));
            sock.on('data', (d) => { out += d.toString('latin1'); });
            sock.on('end', () => finish(parseClamReply(out)));
            sock.on('connect', () => {
                sock.write('zINSTREAM\0');
                for (let i = 0; i < bytes.length; i += 64 * 1024) {
                    const chunk = bytes.subarray(i, i + 64 * 1024);
                    const len = Buffer.alloc(4);
                    len.writeUInt32BE(chunk.length);
                    sock.write(len);
                    sock.write(chunk);
                }
                sock.write(Buffer.alloc(4)); // zero length ends the stream
            });
        }),
    };
}
