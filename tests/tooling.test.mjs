import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changelogSection, stampChangelog, bumpVersion, parseReleaseTag, releaseTag } from '../scripts/lib/modules.mjs';

const changelog = '# Changelog\n\n## 1.0.10\n\n- ten\n\n## 1.0.1\n\n- one\n\n## 1.0.0\n\n- zero\n';

test('changelog: a version picks its own heading, not one it is a prefix of', () => {
    assert.equal(changelogSection(changelog, '1.0.1'), '- one');
    assert.equal(changelogSection(changelog, '1.0.10'), '- ten');
    assert.equal(changelogSection(changelog, '1.0.0'), '- zero');
    assert.equal(changelogSection(changelog, '2.0.0'), '');
});

test('changelog: the Unreleased heading takes the version on release', () => {
    const stamped = stampChangelog('# Changelog\n\n## Unreleased\n\n- new\n\n## 1.0.0\n', '1.1.0');
    assert.equal(changelogSection(stamped, '1.1.0'), '- new');
    assert.equal(stampChangelog(changelog, '1.1.0'), null);
});

test('versions bump and tags round-trip', () => {
    assert.equal(bumpVersion('1.0.7', 'patch'), '1.0.8');
    assert.equal(bumpVersion('1.0.7', 'minor'), '1.1.0');
    assert.equal(bumpVersion('1.0.7', 'major'), '2.0.0');
    assert.deepEqual(parseReleaseTag(releaseTag('hp-in-bar', '1.1.0')), { id: 'hp-in-bar', version: '1.1.0' });
    assert.equal(parseReleaseTag('module_release'), null);
});
