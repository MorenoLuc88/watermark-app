// Messages d'erreur affichés dans le panneau, en français.
const MESSAGES = {
  NO_DOCUMENT: 'Ouvre une photo avant de signer.',
  UNSUPPORTED_MODE: 'Ce mode colorimétrique n\'est pas pris en charge : passe la photo en RVB 8 ou 16 bits.',
  NO_SIGNATURE: 'Aucune signature à inverser.',
};

function errorMessage(err) {
  if (err && typeof err === 'object' && MESSAGES[err.code]) return MESSAGES[err.code];
  let detail = '';
  if (err && typeof err === 'object' && typeof err.message === 'string') detail = err.message;
  else if (err !== null && err !== undefined) detail = String(err);
  return 'Photoshop a refusé l\'opération' + (detail ? ' : ' + detail : '.');
}

module.exports = { errorMessage };
