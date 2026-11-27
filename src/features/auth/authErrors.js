// Messaggi in italiano per gli errori più comuni di Supabase Auth.
export const authErrorMessage = error => {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login")) return "E-mail o password non corrette.";
  if (msg.includes("email not confirmed")) return "Conferma prima la tua e-mail: trovi il link nella posta.";
  if (msg.includes("password should be")) return "La password deve avere almeno 8 caratteri.";
  if (error?.code === "over_email_send_rate_limit" || msg.includes("email rate limit")) {
    return "In questo momento non riusciamo a mandare altre e-mail di conferma. Riprova tra un'ora o chiedi al tuo coach.";
  }
  if (msg.includes("rate limit") || msg.includes("security purposes")) return "Troppi tentativi. Riprova tra qualche minuto.";
  if (msg.includes("network") || msg.includes("fetch")) return "Connessione assente. Riprova quando torni online.";
  return "Qualcosa non è andato a buon fine. Riprova.";
};
