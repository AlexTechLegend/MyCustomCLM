import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderTemplate, slackCard, teamsCard } from './notifications.js';

describe('notification templating', () => {
  it('interpolates certificate, host, blueprint and error', () => {
    const text = renderTemplate(
      'Cert {{certificate.name}} on {{host.hostname}} via {{blueprint.name}}: {{error}}',
      {
        certificate: { name: 'web' },
        host: { hostname: 'iis-01' },
        blueprint: { name: 'prod-web' },
        error: 'verify failed',
      },
    );
    assert.equal(text, 'Cert web on iis-01 via prod-web: verify failed');
  });

  it('replaces missing tokens with empty strings', () => {
    assert.equal(renderTemplate('x{{missing.y}}z', {}), 'xz');
  });
});

describe('notification cards', () => {
  it('builds a Slack block kit card', () => {
    const card = slackCard('Hello', 'Body text');
    assert.equal(card.text, 'Hello');
    const blocks = card.blocks as Array<{ type: string }>;
    assert.equal(blocks[0].type, 'header');
  });

  it('builds a Teams MessageCard', () => {
    const card = teamsCard('Hello', 'Body text');
    assert.equal(card['@type'], 'MessageCard');
    assert.equal(card.title, 'Hello');
    assert.equal(card.text, 'Body text');
  });
});
