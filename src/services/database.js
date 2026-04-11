export async function tableExists(supabaseClient, tableName) {
  const { error } = await supabaseClient
    .from(tableName)
    .select("id", { count: "exact", head: true });

  return !error;
}
