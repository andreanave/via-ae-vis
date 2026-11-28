// Messaggi leggibili per gli errori delle funzioni del database.
const MESSAGES = {
  invite_not_found: "Questo invito non esiste. Chiedi al tuo coach un nuovo link.",
  invite_already_used: "Questo invito è già stato usato.",
  invite_expired: "L'invito è scaduto. Chiedi al tuo coach di mandartene uno nuovo.",
  invite_email_mismatch: "Sei entrato con un'e-mail diversa da quella dell'invito. Esci ed entra con l'e-mail giusta.",
  not_authenticated: "Devi prima accedere.",
  forbidden: "Non hai i permessi per questa operazione.",
  label_photo_required: "Per l'approvazione da etichetta serve la foto dell'etichetta.",
  invalid_provenance: "Provenienza dei valori non valida.",
  same_food: "Scegli una voce diversa da quella da accorpare.",
  target_merged: "Quella voce è già stata accorpata a un'altra: scegli la voce principale.",
};

export const rpcErrorMessage = error => {
  const msg = error?.message || "";
  const key = Object.keys(MESSAGES).find(k => msg.includes(k));
  return key ? MESSAGES[key] : "Qualcosa non è andato a buon fine. Riprova.";
};
