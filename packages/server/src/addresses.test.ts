import { describe, expect, it } from 'vitest';
import { addressKind, isAddressLiteral, readAddress } from './addresses';

describe('addressKind', () => {
  it('knows what no name granted to package code may lead to', () => {
    const cases: [string, ReturnType<typeof addressKind>][] = [
      ['0.0.0.0', 'unspecified'],
      ['0.1.2.3', 'unspecified'],
      ['::', 'unspecified'],
      ['127.0.0.1', 'loopback'],
      ['127.255.0.9', 'loopback'],
      ['::1', 'loopback'],
      ['10.0.0.5', 'private'],
      ['172.16.0.1', 'private'],
      ['172.31.255.255', 'private'],
      ['192.168.1.20', 'private'],
      ['100.64.0.1', 'private'],
      ['100.127.255.255', 'private'],
      ['fc00::1', 'private'],
      ['fd12:3456::1', 'private'],
      ['169.254.169.254', 'link-local'],
      ['169.254.0.1', 'link-local'],
      ['fe80::1', 'link-local'],
      ['febf::1', 'link-local'],
      ['224.0.0.1', 'multicast'],
      ['239.255.255.250', 'multicast'],
      ['ff02::1', 'multicast'],
      ['255.255.255.255', 'reserved'],
      ['240.0.0.1', 'reserved'],
      ['192.0.2.1', 'reserved'],
      ['2001:db8::1', 'reserved'],
      ['93.184.216.34', 'public'],
      ['172.15.0.1', 'public'],
      ['172.32.0.1', 'public'],
      ['100.63.0.1', 'public'],
      ['2606:4700::1111', 'public'],
    ];
    for (const [address, kind] of cases) expect(addressKind(address), address).toBe(kind);
  });

  it('reads an IPv4 address that IPv6 carries as that IPv4 address', () => {
    expect(addressKind('::ffff:127.0.0.1')).toBe('loopback');
    expect(addressKind('::ffff:7f00:1')).toBe('loopback');
    expect(addressKind('[::ffff:169.254.169.254]')).toBe('link-local');
    expect(addressKind('::ffff:a00:5')).toBe('private');
    expect(addressKind('::127.0.0.1')).toBe('loopback');
    expect(addressKind('64:ff9b::a9fe:a9fe')).toBe('link-local');
    expect(addressKind('2002:7f00:1::')).toBe('loopback');
    expect(addressKind('::ffff:93.184.216.34')).toBe('public');
    expect(readAddress('::ffff:10.0.0.5')).toEqual({ family: 4, bytes: [10, 0, 0, 5] });
  });

  it('reads IPv6 with a zone, and refuses what is not an address', () => {
    expect(addressKind('fe80::1%eth0')).toBe('link-local');
    for (const text of [
      'localhost',
      'status.example.com',
      '1.2.3',
      '01.2.3.4',
      '1.2.3.256',
      ':::',
      '1::2::3',
      '12345::1',
      '',
    ]) {
      expect(addressKind(text), text).toBeUndefined();
    }
    expect(isAddressLiteral('192.168.1.20')).toBe(true);
    expect(isAddressLiteral('status.example.com')).toBe(false);
  });
});
