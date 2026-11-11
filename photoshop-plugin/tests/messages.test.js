const test = require('node:test');
const assert = require('node:assert');
const { errorMessage } = require('../src/messages.js');
const { SignError } = require('../src/sign.js');

test('chaque code d\'erreur a son message en français', () => {
  assert.strictEqual(errorMessage(new SignError('NO_DOCUMENT', 'x')), 'Ouvre une photo avant de signer.');
  assert.strictEqual(errorMessage(new SignError('UNSUPPORTED_MODE', 'x')), 'Ce mode colorimétrique n\'est pas pris en charge : passe la photo en RVB 8 ou 16 bits.');
  assert.strictEqual(errorMessage(new SignError('NO_SIGNATURE', 'x')), 'Aucune signature à inverser.');
});

test('une erreur Photoshop affiche le détail après le préfixe', () => {
  assert.strictEqual(errorMessage(new SignError('PS_ERROR', 'boom')), 'Photoshop a refusé l\'opération : boom');
});

test('une erreur quelconque ou une valeur inattendue ne lève pas d\'exception et donne un texte', () => {
  assert.strictEqual(errorMessage(new Error('oups')), 'Photoshop a refusé l\'opération : oups');
  for (const v of ['boom', 42, null, undefined, {}]) {
    const m = errorMessage(v);
    assert.strictEqual(typeof m, 'string');
    assert.ok(m.length > 0);
  }
});
