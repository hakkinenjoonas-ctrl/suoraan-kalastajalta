export const MAX_AUCTION_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_AUCTION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MAX_AUCTION_IMAGE_DIMENSION = 1920;
const JPEG_QUALITIES = [0.86, 0.78, 0.68, 0.58];

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Kuvan pakkaaminen epäonnistui.")),
      "image/jpeg",
      quality,
    );
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Kuvaa ei voitu avata."));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareAuctionImage(file) {
  if (!file) return null;
  if (!ALLOWED_AUCTION_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Valitse JPG-, PNG- tai WebP-kuva.");
  }
  if (file.size <= MAX_AUCTION_IMAGE_BYTES) return file;

  const image = await decodeImage(file);
  const sourceWidth = Number(image.width || image.naturalWidth || 0);
  const sourceHeight = Number(image.height || image.naturalHeight || 0);
  if (!sourceWidth || !sourceHeight) {
    if (typeof image.close === "function") image.close();
    throw new Error("Kuvan mittoja ei voitu lukea.");
  }

  const scale = Math.min(1, MAX_AUCTION_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    if (typeof image.close === "function") image.close();
    throw new Error("Kuvan pienentäminen ei onnistu tällä laitteella.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (typeof image.close === "function") image.close();

  let compressedBlob = null;
  for (const quality of JPEG_QUALITIES) {
    compressedBlob = await canvasToBlob(canvas, quality);
    if (compressedBlob.size <= MAX_AUCTION_IMAGE_BYTES) break;
  }
  if (!compressedBlob || compressedBlob.size > MAX_AUCTION_IMAGE_BYTES) {
    throw new Error("Kuvaa ei saatu pienennettyä alle 5 Mt:n kokoon. Valitse toinen kuva.");
  }

  const baseName = String(file.name || "huutokauppakuva").replace(/\.[^.]+$/, "");
  return new File([compressedBlob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
