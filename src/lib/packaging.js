export const FISH_PACKAGING_OPTIONS = Object.freeze([
  "EPS-kalalaatikko (styrox), 5 kg",
  "EPS-kalalaatikko (styrox), 10 kg",
  "EPS-kalalaatikko (styrox), 20 kg",
  "Vedenpitävä aaltopahvinen kalalaatikko, 5 kg",
  "Vedenpitävä aaltopahvinen kalalaatikko, 10 kg",
  "Vedenpitävä aaltopahvinen kalalaatikko, 20 kg",
  "Muovinen kalapakki, 150 l",
  "Muovinen kalapakki, 300 l",
  "Muovinen kalapakki, 600 l",
  "Pönttö / muu pakki",
  "Muu pakkaustapa",
]);

export function extractPackagingFromNotes(notes) {
  return (String(notes || "").match(/(?:^|\n)Pakkaustapa:\s*(.+)/i)?.[1] || "").trim();
}

export function removePackagingFromNotes(notes) {
  return String(notes || "")
    .split("\n")
    .filter((line) => !line.trim().toLocaleLowerCase("fi-FI").startsWith("pakkaustapa:"))
    .join("\n")
    .trim();
}
