import { describe, expect, it } from 'vitest';

import { canonicalizeOpenness } from './openness';

describe('canonicalizeOpenness', () => {
  it.each([
    ['public', 'public'],
    ['公开', 'public'],
    ['公开平台', 'public'],
    ['数据公开；仓库及数据无许可证文件', 'public'],
    ['public, noncommercial license', 'public'],
    ['partly', 'partly public'],
    ['部分公开', 'partly public'],
    ['public subset', 'partly public'],
    ['mixed', 'partly public'],
    ['公开密码归档；当前镜像自动门控', 'partly public'],
    ['公开评测平台；完整快照与数据许可证未披露', 'partly public'],
    ['private', 'in-house'],
    ['内部数据集', 'in-house'],
    ['未披露', ''],
    ['', ''],
  ])('maps %s to %s', (value, expected) => {
    expect(canonicalizeOpenness(value)).toBe(expected);
  });

  it.each(['restricted pending review', null, [], 17])(
    'rejects unsupported value %j',
    value => {
      expect(canonicalizeOpenness(value)).toBeUndefined();
    },
  );
});
