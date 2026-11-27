// Messaggi in italiano per gli errori più comuni di Supabase Auth.
export const authErrorMessage = error => {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login")) return "E-mail o password non corrette.";
  if (msg.includes("email not confirmed")) return "Conferma prima la tua e-mail: trovi il link nella posta.";
  if (msg.includes("password should be")) return "La password deve avere almeno 8 caratteri.";
  if (msg.includes("rate limit")) return "Troppi tentativi. Riprova tra qualche minuto.";
  if (msg.includes("network") || msg.includes("fetch")) return "Connessione assente. Riprova quando torni online.";
  return "Qualcosa non è andato a buon fine. Riprova.";
};
