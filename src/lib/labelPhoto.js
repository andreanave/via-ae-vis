import { supabase } from "./supabase.js";

// Foto delle etichette nel bucket privato food-labels, nella cartella dell'utente.
const BUCKET = "food-labels";
const MAX_SIDE = 1600;

// Riduce la foto (le fotocamere dei telefoni fanno file da 3-5 MB) mantenendo leggibili le cifre.
export async function shrinkImage(file, maxSide = MAX_SIDE, quality = 0.85) {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadLabelPhoto(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("forbidden");
  const body = await shrinkImage(file);
  const ext = body.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: body.type || file.type });
  if (error) throw error;
  return path;
}

export async function labelPhotoUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
