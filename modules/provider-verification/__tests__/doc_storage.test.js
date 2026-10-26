import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseClamReply, presign, safeDocName, sniffProviderDoc } from '../doc_storage.js';
describe('SigV4 presign', () => {
    it('matches the AWS documentation example for a presigned GET', () => {
        const url = presign({ endpoint: 'https://s3.amazonaws.com', bucket: 'examplebucket', region: 'us-east-1', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }, 'GET', 'test.txt', 86400, {}, new Date('2013-05-24T00:00:00Z'));
        assert.equal(url, 'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
    });
    it('signs the upload headers so the uploader cannot change the size or type', () => {
        const c = { endpoint: 'https://acct.r2.cloudflarestorage.com', bucket: 'b', region: 'auto', accessKey: 'AK', secretKey: 'SK', pathStyle: true };
        const a = presign(c, 'PUT', 'pv/1/doc', 300, { 'content-type': 'application/pdf', 'content-length': '1000' }, new Date('2026-10-23T10:00:00Z'));
        const b = presign(c, 'PUT', 'pv/1/doc', 300, { 'content-type': 'application/pdf', 'content-length': '2000' }, new Date('2026-10-23T10:00:00Z'));
        assert.match(a, /X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost/);
        assert.notEqual(a.split('X-Amz-Signature=')[1], b.split('X-Amz-Signature=')[1]);
        assert.ok(a.startsWith('https://acct.r2.cloudflarestorage.com/b/pv/1/doc?'));
    });
});
describe('document type', () => {
    it('reads PDF, JPEG and PNG from the first bytes', () => {
        assert.equal(sniffProviderDoc(Buffer.from('%PDF-1.7 ...')), 'application/pdf');
        assert.equal(sniffProviderDoc(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), 'image/jpeg');
        assert.equal(sniffProviderDoc(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
    });
    it('refuses everything else, whatever the name says', () => {
        assert.equal(sniffProviderDoc(Buffer.from('MZ\x90\x00')), null);
        assert.equal(sniffProviderDoc(Buffer.from('<html>')), null);
        assert.equal(sniffProviderDoc(Buffer.alloc(0)), null);
        assert.equal(sniffProviderDoc(Buffer.from('PK\x03\x04')), null);
    });
    it('cleans file names', () => {
        assert.equal(safeDocName('../../etc/passwd'), '.._.._etc_passwd');
        assert.equal(safeDocName(''), 'document');
        assert.equal(safeDocName('a'.repeat(500)).length, 120);
    });
});
describe('clamd reply', () => {
    it('reads clean, infected and everything else', () => {
        assert.equal(parseClamReply('stream: OK\0'), 'clean');
        assert.equal(parseClamReply('stream: Eicar-Test-Signature FOUND\0'), 'infected');
        assert.equal(parseClamReply('INSTREAM size limit exceeded. ERROR'), 'error');
        assert.equal(parseClamReply(''), 'error');
    });
});
